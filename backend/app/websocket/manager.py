import asyncio
import secrets
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import WebSocket

from app.models.websocket import PlayerMovePayload, PlayerState, Vector3

TICKET_LIFETIME_SECONDS = 30
MOVE_INTERVAL_SECONDS = 1 / 30
CHAT_INTERVAL_SECONDS = 0.5


@dataclass(frozen=True)
class TicketIdentity:
    subject: str
    username: str


@dataclass
class Connection:
    websocket: WebSocket
    player: PlayerState
    last_move_at: float = 0
    last_chat_at: float = 0


@dataclass
class ConnectionManager:
    connections: dict[str, Connection] = field(default_factory=dict)
    tickets: dict[str, tuple[float, TicketIdentity]] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    background_tasks: set[asyncio.Task[None]] = field(default_factory=set)

    async def issue_ticket(self, identity: TicketIdentity) -> str:
        ticket = secrets.token_urlsafe(32)
        now = time.monotonic()
        async with self.lock:
            self.tickets = {key: value for key, value in self.tickets.items() if value[0] > now}
            self.tickets[ticket] = (now + TICKET_LIFETIME_SECONDS, identity)
        return ticket

    async def consume_ticket(self, ticket: str) -> TicketIdentity | None:
        async with self.lock:
            entry = self.tickets.pop(ticket, None)
        if entry is None or entry[0] <= time.monotonic():
            return None
        return entry[1]

    async def connect(self, websocket: WebSocket, identity: TicketIdentity) -> Connection:
        await websocket.accept()
        player_id = str(uuid4())
        connection = Connection(
            websocket=websocket,
            player=PlayerState(
                id=player_id,
                username=identity.username,
                position=Vector3(x=0, y=1.65, z=8.15),
                rotation=0,
            ),
        )
        async with self.lock:
            snapshot = [item.player for item in self.connections.values()]
            self.connections[player_id] = connection
        await websocket.send_json(
            {
                "type": "lobby.welcome",
                "payload": {
                    "self_id": player_id,
                    "players": [p.model_dump() for p in [*snapshot, connection.player]],
                },
            }
        )
        await self.broadcast(
            {"type": "player.joined", "payload": connection.player.model_dump()},
            exclude=player_id,
        )
        return connection

    async def disconnect(self, player_id: str) -> None:
        async with self.lock:
            connection = self.connections.pop(player_id, None)
        if connection is not None:
            task = asyncio.create_task(
                self.broadcast(
                    {
                        "type": "player.left",
                        "payload": {
                            "id": player_id,
                            "username": connection.player.username,
                        },
                    }
                )
            )
            self.background_tasks.add(task)
            task.add_done_callback(self.background_tasks.discard)

    async def move(self, connection: Connection, payload: PlayerMovePayload) -> bool:
        now = time.monotonic()
        if now - connection.last_move_at < MOVE_INTERVAL_SECONDS:
            return False
        connection.last_move_at = now
        connection.player.position = payload.position
        connection.player.rotation = payload.rotation
        await self.broadcast(
            {
                "type": "player.moved",
                "payload": {
                    "id": connection.player.id,
                    **payload.model_dump(),
                },
            },
            exclude=connection.player.id,
        )
        return True

    async def chat(self, connection: Connection, text: str) -> bool:
        now = time.monotonic()
        if now - connection.last_chat_at < CHAT_INTERVAL_SECONDS:
            return False
        connection.last_chat_at = now
        await self.broadcast(
            {
                "type": "chat.message",
                "payload": {
                    "id": str(uuid4()),
                    "player_id": connection.player.id,
                    "username": connection.player.username,
                    "text": text,
                    "sent_at": datetime.now(UTC).isoformat(),
                },
            }
        )
        return True

    async def send_error(self, connection: Connection, code: str, message: str) -> None:
        await connection.websocket.send_json(
            {"type": "error", "payload": {"code": code, "message": message}}
        )

    async def broadcast(self, message: dict[str, Any], exclude: str | None = None) -> None:
        async with self.lock:
            recipients = [
                connection
                for player_id, connection in self.connections.items()
                if player_id != exclude
            ]
        for recipient in recipients:
            try:
                await recipient.websocket.send_json(message)
            except RuntimeError:
                # Its receive loop owns cleanup if the connection closed during broadcast.
                continue
