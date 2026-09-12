from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo import AsyncMongoClient

from app.config import Settings, get_settings
from app.db.mongodb import get_mongo_client
from app.models.health import DatabaseHealthResponse, HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="job-application-game-backend")


@router.get("/health/database", response_model=DatabaseHealthResponse)
async def database_health(
    client: Annotated[AsyncMongoClient, Depends(get_mongo_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DatabaseHealthResponse:
    try:
        await client.admin.command("ping")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB is unavailable",
        ) from exc

    return DatabaseHealthResponse(status="ok", database=settings.mongodb_database)
