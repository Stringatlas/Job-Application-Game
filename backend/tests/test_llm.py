import asyncio
import json
from typing import Any

from bson import ObjectId

from app.services.llm import ChatMessage, LobbyLlmResponder
from app.websocket.manager import LobbyChatMessage, LobbyPlayer


class FakeProvider:
    def __init__(self, response: str) -> None:
        self.response = response
        self.messages: list[ChatMessage] = []

    async def complete(self, messages: list[ChatMessage]) -> str:
        self.messages = messages
        return self.response


class FakeCursor:
    def __init__(self, documents: list[dict[str, Any]]) -> None:
        self.documents = documents
        self.position = 0

    def sort(self, _field: str, _direction: int) -> "FakeCursor":
        return self

    def limit(self, limit: int) -> "FakeCursor":
        self.documents = self.documents[:limit]
        return self

    def __aiter__(self) -> "FakeCursor":
        return self

    async def __anext__(self) -> dict[str, Any]:
        if self.position >= len(self.documents):
            raise StopAsyncIteration
        document = self.documents[self.position]
        self.position += 1
        return document


class FakeCollection:
    def __init__(self, documents: list[dict[str, Any]]) -> None:
        self.documents = documents

    def find(self, query: dict[str, Any]) -> FakeCursor:
        def matches(document: dict[str, Any]) -> bool:
            for field, expected in query.items():
                actual = document.get(field)
                if isinstance(expected, dict) and "$in" in expected:
                    if actual not in expected["$in"]:
                        return False
                elif isinstance(expected, dict) and "$ne" in expected:
                    if actual == expected["$ne"]:
                        return False
                elif actual != expected:
                    return False
            return True

        return FakeCursor([document for document in self.documents if matches(document)])


class FakeDatabase:
    def __init__(
        self,
        jobs: list[dict[str, Any]],
        users: list[dict[str, Any]],
        applications: list[dict[str, Any]],
    ) -> None:
        self.jobs = FakeCollection(jobs)
        self.users = FakeCollection(users)
        self.job_applications = FakeCollection(applications)


def test_lobby_llm_receives_applied_and_unapplied_job_context() -> None:
    player_id = ObjectId()
    applied_job_id = ObjectId()
    unapplied_job_id = ObjectId()
    hidden_job_id = ObjectId()
    jobs = [
        {
            "_id": applied_job_id,
            "title": "Night Auditor",
            "company": "The Overlook",
            "location": "Remote",
            "remote": True,
            "status": "active",
            "tags": ["python"],
        },
        {
            "_id": unapplied_job_id,
            "title": "Archive Clerk",
            "company": "Blackwood Records",
            "location": "Pittsburgh",
            "remote": False,
            "status": "active",
            "tags": [],
        },
        {
            "_id": hidden_job_id,
            "title": "Hidden Role",
            "company": "Unknown",
            "location": "Unknown",
            "remote": False,
            "status": "hidden",
            "tags": [],
        },
    ]
    database = FakeDatabase(
        jobs,
        [{"_id": player_id, "auth0_sub": "auth0|one", "username": "Player_One"}],
        [
            {
                "user_id": player_id,
                "job_listing_id": applied_job_id,
                "status": "interviewing",
            }
        ],
    )
    provider = FakeProvider("The ledger remembers your name.")
    responder = LobbyLlmResponder(provider)

    response = asyncio.run(
        responder.respond(
            database,  # type: ignore[arg-type]
            [LobbyPlayer(subject="auth0|one", username="Player_One")],
            "Player_One",
            "What have I applied to?",
            [
                LobbyChatMessage(username="Mysterious Horizon", text="The ledger opens."),
                LobbyChatMessage(username="Player_One", text="What have I applied to?"),
            ],
        )
    )

    assert response == "The ledger remembers your name."
    assert provider.messages[0]["role"] == "system"
    prompt = provider.messages[1]["content"]
    serialized_context = prompt.split("Current lobby snapshot:\n", 1)[1].split("\n\n", 1)[0]
    context = json.loads(serialized_context)
    player = context["players"][0]
    assert player["tracked_applications"] == [
        {
            "job_key": str(applied_job_id),
            "title": "Night Auditor",
            "company": "The Overlook",
            "status": "interviewing",
        }
    ]
    assert player["not_applied"] == [
        {
            "job_key": str(unapplied_job_id),
            "title": "Archive Clerk",
            "company": "Blackwood Records",
        }
    ]
    assert "Hidden Role" not in prompt
    assert "What have I applied to?" in prompt
    assert "The ledger opens." in prompt


def test_lobby_llm_caps_chat_response_at_300_characters() -> None:
    provider = FakeProvider("x" * 350)
    responder = LobbyLlmResponder(provider)
    database = FakeDatabase([], [], [])

    response = asyncio.run(
        responder.respond(
            database,  # type: ignore[arg-type]
            [],
            "Player_One",
            "Hello?",
        )
    )

    assert response == "x" * 300
