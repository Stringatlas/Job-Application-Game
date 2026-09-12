from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from app.config import get_settings
from app.db.mongodb import get_mongo_client
from app.main import app


class FakeAdmin:
    async def command(self, command: str) -> dict[str, float]:
        assert command == "ping"
        return {"ok": 1.0}


class FakeMongoClient:
    admin = FakeAdmin()


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
