from datetime import UTC, datetime
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.auth.dependencies import CurrentUser
from app.db.mongodb import get_ready_database
from app.models.user import (
    AuthenticatedUser,
    JobApplication,
    JobApplicationCreate,
    UserProfile,
    UserProfileCreate,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=AuthenticatedUser)
async def get_me(user: CurrentUser) -> AuthenticatedUser:
    return user


def _profile_from_document(document: dict) -> UserProfile:
    return UserProfile(
        id=str(document["_id"]),
        username=document["username"],
        display_name=document.get("display_name"),
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def _application_from_document(document: dict) -> JobApplication:
    return JobApplication(
        id=str(document["_id"]),
        user_id=str(document["user_id"]),
        job_listing_id=str(document["job_listing_id"]),
        status=document["status"],
        applied_at=document["applied_at"],
        updated_at=document["updated_at"],
    )


@router.get("/me/profile", response_model=UserProfile)
async def get_my_profile(
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> UserProfile:
    document = await database.users.find_one({"auth0_sub": user.sub})
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return _profile_from_document(document)


@router.post("/me/profile", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
async def create_my_profile(
    payload: UserProfileCreate,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> UserProfile:
    now = datetime.now(UTC)
    document = {
        "auth0_sub": user.sub,
        "username": payload.username,
        "username_key": payload.username.casefold(),
        "display_name": payload.display_name,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = await database.users.insert_one(document)
    except DuplicateKeyError as exc:
        if await database.users.find_one({"auth0_sub": user.sub}) is not None:
            detail = "Profile already exists"
        else:
            detail = "Username is already taken"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        ) from exc
    document["_id"] = result.inserted_id
    return _profile_from_document(document)


@router.put("/me/applications", response_model=JobApplication)
async def record_job_application(
    payload: JobApplicationCreate,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> JobApplication:
    if not ObjectId.is_valid(payload.job_listing_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Create a user profile before recording an application",
        )
    job_id = ObjectId(payload.job_listing_id)
    if await database.jobs.find_one({"_id": job_id}) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    now = datetime.now(UTC)
    document = await database.job_applications.find_one_and_update(
        {"user_id": profile["_id"], "job_listing_id": job_id},
        {
            "$set": {"status": payload.status, "updated_at": now},
            "$setOnInsert": {"applied_at": now},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return _application_from_document(document)


@router.get("/me/applications", response_model=list[JobApplication])
async def list_job_applications(
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> list[JobApplication]:
    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        return []
    cursor = database.job_applications.find({"user_id": profile["_id"]}).sort("updated_at", -1)
    return [_application_from_document(document) async for document in cursor]
