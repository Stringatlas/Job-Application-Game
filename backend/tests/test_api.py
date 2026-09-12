import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
from bson import ObjectId
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pytest import MonkeyPatch

from app.auth.dependencies import get_current_user
from app.config import get_settings
from app.db.mongodb import ensure_indexes, get_mongo_client, get_ready_database
from app.main import app
from app.models.job import JobListingCreate
from app.models.user import AuthenticatedUser
from app.services.rate_limit import RateLimitExceeded, consume_job_post


class FakeAdmin:
    async def command(self, command: str) -> dict[str, float]:
        assert command == "ping"
        return {"ok": 1.0}


class FakeMongoClient:
    admin = FakeAdmin()


class FakeIndexCollection:
    def __init__(self) -> None:
        self.indexes: list[tuple[object, dict]] = []

    async def create_index(self, keys: object, **options: object) -> str:
        self.indexes.append((keys, options))
        return "test_index"


class FakeIndexDatabase:
    def __init__(self) -> None:
        self.users = FakeIndexCollection()
        self.jobs = FakeIndexCollection()
        self.job_applications = FakeIndexCollection()
        self.rate_limits = FakeIndexCollection()


class FakeUsersCollection:
    def __init__(self) -> None:
        self.document: dict | None = None

    async def find_one(self, query: dict) -> dict | None:
        if self.document and self.document["auth0_sub"] == query["auth0_sub"]:
            return self.document
        return None

    async def find_one_and_update(self, query: dict, update: dict, **_options: object) -> dict:
        if self.document is None:
            self.document = {
                "_id": ObjectId(),
                "auth0_sub": query["auth0_sub"],
                **update["$setOnInsert"],
            }
        self.document.update(update["$set"])
        return self.document


class FakeProfileDatabase:
    def __init__(self) -> None:
        self.users = FakeUsersCollection()


class FakeJobCursor:
    def __init__(self, documents: list[dict]) -> None:
        self.documents = documents
        self.position = 0

    def sort(self, _field: str, _direction: int) -> "FakeJobCursor":
        return self

    def limit(self, limit: int) -> "FakeJobCursor":
        self.documents = self.documents[:limit]
        return self

    def __aiter__(self) -> "FakeJobCursor":
        return self

    async def __anext__(self) -> dict:
        if self.position >= len(self.documents):
            raise StopAsyncIteration
        document = self.documents[self.position]
        self.position += 1
        return document


class FakeJobsCollection:
    def __init__(self, documents: list[dict]) -> None:
        self.documents = documents

    def find(self, _query: dict) -> FakeJobCursor:
        return FakeJobCursor(self.documents.copy())


class FakeJobListDatabase:
    def __init__(self, documents: list[dict]) -> None:
        self.jobs = FakeJobsCollection(documents)


class FakeRateLimitCollection:
    def __init__(self, limited: bool = False) -> None:
        self.limited = limited
        self.last_query: dict | None = None

    async def find_one_and_update(self, query: dict, _update: dict, **_options: object) -> dict:
        from pymongo.errors import DuplicateKeyError

        self.last_query = query
        if self.limited:
            raise DuplicateKeyError("fixed window is full")
        return {"count": 1}


class FakeRateLimitDatabase:
    def __init__(self, limited: bool = False) -> None:
        self.rate_limits = FakeRateLimitCollection(limited)


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "job-application-game-backend",
    }


def test_database_health() -> None:
    app.dependency_overrides[get_mongo_client] = lambda: FakeMongoClient()
    try:
        with TestClient(app) as client:
            response = client.get("/api/health/database")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "job_application_game"}


def test_database_indexes_enforce_unique_references() -> None:
    database = FakeIndexDatabase()

    asyncio.run(ensure_indexes(database))  # type: ignore[arg-type]

    assert ("auth0_sub", {"unique": True}) in database.users.indexes
    assert ("username_key", {"unique": True}) in database.users.indexes
    assert ("canonical_url", {"unique": True}) in database.jobs.indexes
    assert (
        [("user_id", 1), ("job_listing_id", 1)],
        {"unique": True},
    ) in database.job_applications.indexes
    assert (
        [("user_id", 1), ("action", 1), ("window_start", 1)],
        {"unique": True},
    ) in database.rate_limits.indexes
    assert ("expires_at", {"expireAfterSeconds": 0}) in database.rate_limits.indexes


def test_job_post_rate_limit_is_scoped_to_the_authenticated_user() -> None:
    database = FakeRateLimitDatabase()
    user_id = ObjectId()

    asyncio.run(consume_job_post(database, user_id))  # type: ignore[arg-type]

    assert database.rate_limits.last_query is not None
    assert database.rate_limits.last_query["user_id"] == user_id
    assert database.rate_limits.last_query["action"] == "job.post"
    assert database.rate_limits.last_query["count"] == {"$lt": 5}


def test_job_post_rate_limit_reports_retry_time() -> None:
    database = FakeRateLimitDatabase(limited=True)

    try:
        asyncio.run(consume_job_post(database, ObjectId()))  # type: ignore[arg-type]
    except RateLimitExceeded as exc:
        assert 1 <= exc.retry_after_seconds <= 3_600
    else:
        raise AssertionError("Expected the job posting limit to be enforced")


def test_job_listing_requires_secure_external_url() -> None:
    try:
        JobListingCreate(
            title="Software Engineer Intern",
            company="Example",
            location="Remote",
            external_url="http://example.com/jobs/1",
        )
    except ValidationError as exc:
        assert "must use https" in str(exc)
    else:
        raise AssertionError("Expected insecure job URL to be rejected")


def test_list_jobs_returns_board_listings() -> None:
    now = datetime.now(UTC)
    database = FakeJobListDatabase(
        [
            {
                "_id": ObjectId(),
                "title": "Software Engineer Intern",
                "company": "Example",
                "location": "Remote",
                "remote": True,
                "external_url": "https://example.com/jobs/1",
                "description": None,
                "tags": ["internship"],
                "submitter_id": ObjectId(),
                "status": "active",
                "useful_votes": 0,
                "stale_votes": 0,
                "created_at": now,
                "updated_at": now,
            }
        ]
    )
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            response = client.get("/api/jobs")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Software Engineer Intern"


def test_me_requires_bearer_token() -> None:
    with TestClient(app) as client:
        response = client.get("/api/users/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Bearer token required"}


def test_me_returns_verified_identity(monkeypatch: MonkeyPatch) -> None:
    from cryptography.hazmat.primitives.asymmetric import rsa

    settings = get_settings()
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(
        {
            "sub": "auth0|test-user",
            "name": "Test Player",
            "email": "player@example.com",
            "iss": settings.auth0_issuer,
            "aud": settings.auth0_audience,
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )
    monkeypatch.setattr(
        "app.auth.dependencies.PyJWKClient.get_signing_key_from_jwt",
        lambda _client, _token: SimpleNamespace(key=private_key.public_key()),
    )

    with TestClient(app) as client:
        response = client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "sub": "auth0|test-user",
        "display_name": "Test Player",
        "email": "player@example.com",
    }


def test_upsert_and_get_profile() -> None:
    database = FakeProfileDatabase()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(sub="auth0|profile-user")
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            update_response = client.put(
                "/api/users/me/profile",
                json={"username": "Player_One", "display_name": "Player One"},
            )
            get_response = client.get("/api/users/me/profile")
    finally:
        app.dependency_overrides.clear()

    assert update_response.status_code == 200
    assert update_response.json()["username"] == "Player_One"
    assert get_response.status_code == 200
    assert get_response.json() == update_response.json()
    assert database.users.document is not None
    assert database.users.document["username_key"] == "player_one"
