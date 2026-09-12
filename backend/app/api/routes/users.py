from fastapi import APIRouter

from app.auth.dependencies import CurrentUser
from app.models.user import AuthenticatedUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=AuthenticatedUser)
async def get_me(user: CurrentUser) -> AuthenticatedUser:
    return user
