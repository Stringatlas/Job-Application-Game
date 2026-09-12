import logging
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import TypeAdapter, ValidationError
from pymongo.asynchronous.database import AsyncDatabase

from app.auth.dependencies import CurrentUser
from app.db.mongodb import get_ready_database
from app.models.websocket import (
    ChatSendMessage,
    PlayerMoveMessage,
    WebSocketTicketResponse,
)
from app.websocket.manager import (
    TICKET_LIFETIME_SECONDS,
    ConnectionManager,
    TicketIdentity,
)

router = APIRouter(tags=["multiplayer"])
client_message_adapter = TypeAdapter(PlayerMoveMessage | ChatSendMessage)
logger = logging.getLogger(__name__)


def get_connection_manager(websocket: WebSocket) -> ConnectionManager:
    return websocket.app.state.connection_manager


@router.post("/api/websocket/ticket", response_model=WebSocketTicketResponse)
async def create_websocket_ticket(
    request: Request,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> WebSocketTicketResponse:
    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Create a user profile before joining the lobby",
        )
    manager: ConnectionManager = request.app.state.connection_manager
    ticket = await manager.issue_ticket(
        TicketIdentity(subject=user.sub, username=profile["username"])
    )
    return WebSocketTicketResponse(ticket=ticket, expires_in=TICKET_LIFETIME_SECONDS)


@router.websocket("/ws")
async def multiplayer_websocket(
    websocket: WebSocket,
    ticket: Annotated[str, Query(min_length=20, max_length=200)],
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> None:
    manager = get_connection_manager(websocket)
    identity = await manager.consume_ticket(ticket)
    if identity is None:
        await websocket.close(code=1008, reason="Invalid or expired ticket")
        return

    connection = await manager.connect(websocket, identity)
    try:
        while True:
            raw_message = await websocket.receive_text()
            try:
                message = client_message_adapter.validate_json(raw_message)
            except ValidationError:
                await manager.send_error(connection, "invalid_message", "Message is malformed")
                continue

            if isinstance(message, PlayerMoveMessage):
                if not await manager.move(connection, message.payload):
                    await manager.send_error(
                        connection, "rate_limited", "Movement update too frequent"
                    )
            elif not await manager.chat(connection, message.payload.text):
                await manager.send_error(
                    connection, "rate_limited", "Chat message sent too quickly"
                )
            else:
                responder = websocket.app.state.lobby_llm
                if responder is not None:
                    try:
                        response = await responder.respond(
                            database,
                            await manager.lobby_players(),
                            connection.player.username,
                            message.payload.text,
                            await manager.recent_chat(
                                websocket.app.state.settings.llm_chat_history_limit
                            ),
                        )
                        if response:
                            await manager.bot_chat(
                                websocket.app.state.settings.llm_display_name, response
                            )
                    except Exception:
                        logger.exception("Lobby LLM failed to respond")
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(connection.player.id)
