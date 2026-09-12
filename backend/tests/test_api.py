import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
from bson import ObjectId
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError
from pytest import MonkeyPatch

from app.auth.dependencies import get_current_user
from app.config import get_settings
from app.db.mongodb import ensure_indexes, get_mongo_client, get_ready_database
from app.main import app, create_app
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
        self.job_ratings = FakeIndexCollection()
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

    async def insert_one(self, document: dict) -> SimpleNamespace:
        if self.document is not None:
            raise DuplicateKeyError("duplicate profile")
        inserted_id = ObjectId()
        self.document = {**document, "_id": inserted_id}
        return SimpleNamespace(inserted_id=inserted_id)


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


class FakeOwnedJobsCollection:
    def __init__(self, documents: list[dict]) -> None:
        self.documents = documents

    def find(self, query: dict) -> FakeJobCursor:
        matches = [
            document
            for document in self.documents
            if all(document.get(key) == value for key, value in query.items())
        ]
        return FakeJobCursor(matches)

    async def find_one(self, query: dict) -> dict | None:
        return next(
            (
                document
                for document in self.documents
                if all(document.get(key) == value for key, value in query.items())
            ),
            None,
        )

    async def find_one_and_update(
        self, query: dict, update: dict, **_options: object
    ) -> dict | None:
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                document.update(update.get("$set", {}))
                for key, value in update.get("$inc", {}).items():
                    document[key] = document.get(key, 0) + value
                return document
        return None

    async def delete_one(self, query: dict) -> SimpleNamespace:
        for index, document in enumerate(self.documents):
            if all(document.get(key) == value for key, value in query.items()):
                self.documents.pop(index)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)


class FakeRatingsCollection:
    def __init__(self) -> None:
        self.documents: list[dict] = []

    async def find_one(self, query: dict) -> dict | None:
        return next(
            (
                document
                for document in self.documents
                if all(document.get(key) == value for key, value in query.items())
            ),
            None,
        )

    async def find_one_and_update(
        self, query: dict, update: dict, **_options: object
    ) -> dict | None:
        document = await self.find_one(query)
        previous = document.copy() if document else None
        if document is None:
            document = {**query, **update.get("$setOnInsert", {})}
            self.documents.append(document)
        document.update(update["$set"])
        return previous

    async def delete_many(self, query: dict) -> SimpleNamespace:
        original_count = len(self.documents)
        self.documents = [
            document
            for document in self.documents
            if not all(document.get(key) == value for key, value in query.items())
        ]
        return SimpleNamespace(deleted_count=original_count - len(self.documents))


class FakeApplicationsCollection:
    def __init__(self) -> None:
        self.documents: list[dict] = []

    def find(self, query: dict) -> FakeJobCursor:
        matches = [
            document
            for document in self.documents
            if all(document.get(key) == value for key, value in query.items())
        ]
        return FakeJobCursor(matches)

    async def find_one_and_update(self, query: dict, update: dict, **_options: object) -> dict:
        document = next(
            (
                candidate
                for candidate in self.documents
                if all(candidate.get(key) == value for key, value in query.items())
            ),
            None,
        )
        if document is None:
            document = {
                "_id": ObjectId(),
                **query,
                **update.get("$setOnInsert", {}),
            }
            self.documents.append(document)
        document.update(update.get("$set", {}))
        return document

    async def delete_many(self, query: dict) -> SimpleNamespace:
        original_count = len(self.documents)
        self.documents = [
            document
            for document in self.documents
            if not all(document.get(key) == value for key, value in query.items())
        ]
        return SimpleNamespace(deleted_count=original_count - len(self.documents))


class FakeOwnedJobsDatabase:
    def __init__(self, profile: dict, documents: list[dict]) -> None:
        self.users = FakeUsersCollection()
        self.users.document = profile
        self.jobs = FakeOwnedJobsCollection(documents)
        self.job_ratings = FakeRatingsCollection()
        self.job_applications = FakeApplicationsCollection()


class FakeApplicationDatabase(FakeOwnedJobsDatabase):
    pass


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


def test_cors_allows_each_configured_frontend_origin(monkeypatch: MonkeyPatch) -> None:
    origins = ["http://localhost:5173", "https://the-job-rooms.vercel.app"]
    monkeypatch.setenv(
        "FRONTEND_ORIGINS",
        '["http://localhost:5173","https://the-job-rooms.vercel.app/"]',
    )
    get_settings.cache_clear()
    try:
        application = create_app()
        with TestClient(application) as client:
            for origin in origins:
                response = client.options(
                    "/api/jobs",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "GET",
                        "Access-Control-Request-Headers": "authorization",
                    },
                )
                assert response.status_code == 200
                assert response.headers["access-control-allow-origin"] == origin
    finally:
        get_settings.cache_clear()


def test_database_indexes_enforce_unique_references() -> None:
    database = FakeIndexDatabase()

    asyncio.run(ensure_indexes(database))  # type: ignore[arg-type]

    assert ("auth0_sub", {"unique": True}) in database.users.indexes
    assert ("username_key", {"unique": True}) in database.users.indexes
    assert ("canonical_url", {"unique": True}) in database.jobs.indexes
    assert (
        [("submitter_id", 1), ("created_at", -1)],
        {},
    ) in database.jobs.indexes
    assert (
        [("user_id", 1), ("job_listing_id", 1)],
        {"unique": True},
    ) in database.job_ratings.indexes
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


def test_owner_can_manage_and_rate_their_own_jobs() -> None:
    now = datetime.now(UTC)
    owner_id = ObjectId()
    own_job_id = ObjectId()
    other_job_id = ObjectId()
    profile = {"_id": owner_id, "auth0_sub": "auth0|job-owner"}

    def job_document(job_id: ObjectId, submitter_id: ObjectId, title: str) -> dict:
        return {
            "_id": job_id,
            "title": title,
            "company": "Example",
            "location": "Remote",
            "remote": True,
            "external_url": f"https://example.com/jobs/{job_id}",
            "canonical_url": f"https://example.com/jobs/{job_id}",
            "description": None,
            "tags": ["internship"],
            "submitter_id": submitter_id,
            "status": "active",
            "useful_votes": 0,
            "stale_votes": 0,
            "created_at": now,
            "updated_at": now,
        }

    database = FakeOwnedJobsDatabase(
        profile,
        [
            job_document(own_job_id, owner_id, "My original listing"),
            job_document(other_job_id, ObjectId(), "Someone else's listing"),
        ],
    )
    database.job_applications.documents.append(
        {
            "_id": ObjectId(),
            "user_id": owner_id,
            "job_listing_id": own_job_id,
            "status": "applied",
            "applied_at": now,
            "updated_at": now,
        }
    )
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(sub="auth0|job-owner")
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            mine_response = client.get("/api/jobs/mine")
            update_response = client.put(
                f"/api/jobs/{own_job_id}",
                json={
                    "title": "My updated listing",
                    "company": "Example",
                    "location": "Pittsburgh, PA",
                    "remote": False,
                    "external_url": "https://example.com/jobs/updated",
                    "description": "Updated description",
                    "tags": ["software"],
                },
            )
            first_rating_response = client.put(
                f"/api/jobs/{own_job_id}/rating",
                json={"stars": 4, "stale": True},
            )
            changed_rating_response = client.put(
                f"/api/jobs/{own_job_id}/rating",
                json={"stars": 2, "stale": False},
            )
            my_rating_response = client.get(f"/api/jobs/{own_job_id}/rating")
            invalid_rating_response = client.put(
                f"/api/jobs/{own_job_id}/rating",
                json={"stars": 6, "stale": False},
            )
            forbidden_delete_response = client.delete(f"/api/jobs/{other_job_id}")
            delete_response = client.delete(f"/api/jobs/{own_job_id}")
    finally:
        app.dependency_overrides.clear()

    assert mine_response.status_code == 200
    assert [job["id"] for job in mine_response.json()] == [str(own_job_id)]
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "My updated listing"
    assert update_response.json()["location"] == "Pittsburgh, PA"
    assert first_rating_response.status_code == 200
    assert first_rating_response.json()["average_rating"] == 4.0
    assert first_rating_response.json()["rating_count"] == 1
    assert first_rating_response.json()["stale_votes"] == 1
    assert changed_rating_response.status_code == 200
    assert changed_rating_response.json()["average_rating"] == 2.0
    assert changed_rating_response.json()["rating_count"] == 1
    assert changed_rating_response.json()["stale_votes"] == 0
    assert my_rating_response.json() == {"stars": 2, "stale": False}
    assert invalid_rating_response.status_code == 422
    assert forbidden_delete_response.status_code == 404
    assert delete_response.status_code == 204
    assert [job["_id"] for job in database.jobs.documents] == [other_job_id]
    assert database.job_applications.documents == []


def test_user_can_record_and_list_job_applications() -> None:
    now = datetime.now(UTC)
    user_id = ObjectId()
    job_id = ObjectId()
    profile = {"_id": user_id, "auth0_sub": "auth0|applicant"}
    job = {
        "_id": job_id,
        "title": "Software Engineer Intern",
        "created_at": now,
    }
    database = FakeApplicationDatabase(profile, [job])
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(sub="auth0|applicant")
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            create_response = client.put(
                "/api/users/me/applications",
                json={"job_listing_id": str(job_id)},
            )
            update_response = client.put(
                "/api/users/me/applications",
                json={"job_listing_id": str(job_id), "status": "interviewing"},
            )
            list_response = client.get("/api/users/me/applications")
    finally:
        app.dependency_overrides.clear()

    assert create_response.status_code == 200
    assert create_response.json()["status"] == "applied"
    assert create_response.json()["job_listing_id"] == str(job_id)
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "interviewing"
    assert update_response.json()["applied_at"] == create_response.json()["applied_at"]
    assert list_response.status_code == 200
    assert list_response.json() == [update_response.json()]


def test_record_application_rejects_unknown_job() -> None:
    profile = {"_id": ObjectId(), "auth0_sub": "auth0|applicant"}
    database = FakeApplicationDatabase(profile, [])
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(sub="auth0|applicant")
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            response = client.put(
                "/api/users/me/applications",
                json={"job_listing_id": str(ObjectId())},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json() == {"detail": "Job not found"}


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


def test_create_and_get_profile() -> None:
    database = FakeProfileDatabase()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(sub="auth0|profile-user")
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            create_response = client.post(
                "/api/users/me/profile",
                json={"username": "Player_One", "display_name": "Player One"},
            )
            get_response = client.get("/api/users/me/profile")
    finally:
        app.dependency_overrides.clear()

    assert create_response.status_code == 201
    assert create_response.json()["username"] == "Player_One"
    assert get_response.status_code == 200
    assert get_response.json() == create_response.json()
    assert database.users.document is not None
    assert database.users.document["username_key"] == "player_one"


def test_profile_username_cannot_be_replaced() -> None:
    database = FakeProfileDatabase()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(sub="auth0|profile-user")
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            first_response = client.post(
                "/api/users/me/profile",
                json={"username": "Player_One", "display_name": "Player One"},
            )
            second_response = client.post(
                "/api/users/me/profile",
                json={"username": "Different_Name", "display_name": "Player One"},
            )
    finally:
        app.dependency_overrides.clear()

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json() == {"detail": "Profile already exists"}
    assert database.users.document is not None
    assert database.users.document["username"] == "Player_One"


def test_authenticated_websocket_tracks_presence_movement_chat_and_departure() -> None:
    database = FakeProfileDatabase()
    database.users.document = {
        "_id": ObjectId(),
        "auth0_sub": "auth0|one",
        "username": "Player_One",
    }
    current_user = AuthenticatedUser(sub="auth0|one")
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            first_ticket = client.post("/api/websocket/ticket").json()["ticket"]

            current_user.sub = "auth0|two"
            assert database.users.document is not None
            database.users.document.update({"auth0_sub": "auth0|two", "username": "Player_Two"})
            second_ticket = client.post("/api/websocket/ticket").json()["ticket"]

            with client.websocket_connect(f"/ws?ticket={first_ticket}") as first_socket:
                first_welcome = first_socket.receive_json()
                assert first_welcome["type"] == "lobby.welcome"
                assert [player["username"] for player in first_welcome["payload"]["players"]] == [
                    "Player_One"
                ]

                with client.websocket_connect(f"/ws?ticket={second_ticket}") as second_socket:
                    second_welcome = second_socket.receive_json()
                    connected_names = {
                        player["username"] for player in second_welcome["payload"]["players"]
                    }
                    assert connected_names == {
                        "Player_One",
                        "Player_Two",
                    }
                    joined = first_socket.receive_json()
                    assert joined["type"] == "player.joined"
                    assert joined["payload"]["username"] == "Player_Two"

                    first_socket.send_json(
                        {
                            "type": "player.move",
                            "payload": {
                                "position": {"x": 1, "y": 1.65, "z": 2},
                                "rotation": 0.5,
                            },
                        }
                    )
                    moved = second_socket.receive_json()
                    assert moved["type"] == "player.moved"
                    assert moved["payload"]["position"]["x"] == 1

                    first_socket.send_json(
                        {"type": "chat.send", "payload": {"text": "Hello office"}}
                    )
                    chat = first_socket.receive_json()
                    assert chat["type"] == "chat.message"
                    assert chat["payload"]["username"] == "Player_One"
                    assert chat["payload"]["text"] == "Hello office"
                    assert second_socket.receive_json()["type"] == "chat.message"

                departed = first_socket.receive_json()
                assert departed["type"] == "player.left"
                assert departed["payload"]["username"] == "Player_Two"
    finally:
        app.dependency_overrides.clear()


def test_websocket_rejects_reused_ticket_and_malformed_messages() -> None:
    database = FakeProfileDatabase()
    database.users.document = {
        "_id": ObjectId(),
        "auth0_sub": "auth0|one",
        "username": "Player_One",
    }
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(sub="auth0|one")
    app.dependency_overrides[get_ready_database] = lambda: database
    try:
        with TestClient(app) as client:
            ticket = client.post("/api/websocket/ticket").json()["ticket"]
            with client.websocket_connect(f"/ws?ticket={ticket}") as socket:
                socket.receive_json()
                socket.send_json({"type": "chat.send", "payload": {"text": ""}})
                error = socket.receive_json()
                assert error["type"] == "error"
                assert error["payload"]["code"] == "invalid_message"

            try:
                with client.websocket_connect(f"/ws?ticket={ticket}"):
                    raise AssertionError("A one-use ticket should not reconnect")
            except WebSocketDisconnect as exc:
                assert exc.code == 1008
    finally:
        app.dependency_overrides.clear()
