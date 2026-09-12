import logging
import random
from typing import Annotated, Protocol
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pymongo.asynchronous.database import AsyncDatabase

from app.auth.dependencies import CurrentUser
from app.db.mongodb import get_ready_database

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/npc", tags=["npc"])

FALLBACK_LINES = (
    "Every vacancy leaves a shape behind. Yours is unusually precise.",
    "The office has been expecting you, though it refuses to say why.",
    "Keep walking. The right door is rarely the one with the brightest light.",
    "Your application is still moving. I cannot promise it is moving forward.",
)
APPROACH_PROMPT = (
    "I approached you in person. Address me directly with one brief, unsettling observation "
    "about this office or my job search. Do not ask a question."
)


class SpeechProvider(Protocol):
    async def synthesize(self, text: str) -> bytes: ...


@router.post("/mysterious-horizon/speak")
async def speak_with_mysterious_horizon(
    request: Request,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> Response:
    speech: SpeechProvider | None = request.app.state.npc_speech
    if speech is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mysterious Horizon's voice is not configured",
        )

    profile = await database.users.find_one({"auth0_sub": user.sub})
    username = profile["username"] if profile else user.display_name or "traveler"
    dialogue = random.choice(FALLBACK_LINES)
    responder = request.app.state.lobby_llm
    if responder is not None:
        try:
            dialogue = await responder.respond(
                database,
                await request.app.state.connection_manager.lobby_players(),
                username,
                APPROACH_PROMPT,
                await request.app.state.connection_manager.recent_chat(
                    request.app.state.settings.llm_chat_history_limit
                ),
            )
        except Exception:
            logger.exception("Mysterious Horizon LLM dialogue generation failed")

    try:
        audio = await speech.synthesize(dialogue)
    except Exception as exc:
        logger.exception("Mysterious Horizon ElevenLabs speech generation failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mysterious Horizon could not speak",
        ) from exc

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-NPC-Dialogue": quote(dialogue, safe=""),
        },
    )
