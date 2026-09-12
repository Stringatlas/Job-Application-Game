from fastapi import APIRouter

from app.api.routes import health, jobs, users

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(users.router)
api_router.include_router(jobs.router)
