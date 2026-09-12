from fastapi import APIRouter

from app.api.routes import health, jobs, npc, users

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(users.router)
api_router.include_router(jobs.router)
api_router.include_router(npc.router)
