import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings
from app.db.mongodb import create_mongo_client, initialize_database_state
from app.services.llm import create_lobby_llm_responder
from app.websocket.manager import ConnectionManager
from app.websocket.routes import router as websocket_router

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logger.info(
        "Lobby LLM startup: enabled=%s key_configured=%s model=%s endpoint=%s",
        settings.llm_enabled,
        bool(settings.llm_api_key),
        settings.llm_model,
        settings.llm_api_url,
    )
    client = create_mongo_client(settings)
    app.state.mongo_client = client
    app.state.database = client[settings.mongodb_database]
    initialize_database_state(app)
    try:
        yield
    finally:
        await client.close()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="Job Application Game API",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.frontend_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Retry-After"],
    )
    application.state.connection_manager = ConnectionManager()
    application.state.lobby_llm = create_lobby_llm_responder(settings)
    application.state.settings = settings
    application.include_router(api_router)
    application.include_router(websocket_router)
    return application


app = create_app()
