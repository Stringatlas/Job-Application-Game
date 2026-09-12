from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import urlsplit, urlunsplit

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.auth.dependencies import CurrentUser
from app.db.mongodb import get_ready_database
from app.models.job import JobListing, JobListingCreate, JobRating, JobRatingCreate
from app.services.rate_limit import RateLimitExceeded, consume_job_post

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_from_document(document: dict) -> JobListing:
    rating_count = document.get("rating_count", 0)
    rating_sum = document.get("rating_sum", 0)
    return JobListing(
        id=str(document["_id"]),
        title=document["title"],
        company=document["company"],
        location=document["location"],
        remote=document["remote"],
        external_url=document["external_url"],
        description=document.get("description"),
        tags=document["tags"],
        submitter_id=str(document["submitter_id"]),
        status=document["status"],
        useful_votes=document["useful_votes"],
        stale_votes=document["stale_votes"],
        average_rating=round(rating_sum / rating_count, 1) if rating_count else None,
        rating_count=rating_count,
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def _canonicalize_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(
        (
            parts.scheme.lower(),
            parts.netloc.lower(),
            parts.path.rstrip("/"),
            parts.query,
            "",
        )
    )


@router.post("", response_model=JobListing, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobListingCreate,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> JobListing:
    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Create a user profile before submitting a job",
        )

    now = datetime.now(UTC)
    external_url = str(payload.external_url)
    document = {
        **payload.model_dump(exclude={"external_url"}),
        "external_url": external_url,
        "canonical_url": _canonicalize_url(external_url),
        "submitter_id": profile["_id"],
        "status": "active",
        "useful_votes": 0,
        "stale_votes": 0,
        "rating_sum": 0,
        "rating_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    try:
        await consume_job_post(database, profile["_id"])
        result = await database.jobs.insert_one(document)
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Job posting limit reached. Try again later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A job with this URL already exists",
        ) from exc

    document["_id"] = result.inserted_id
    return _job_from_document(document)


@router.get("", response_model=list[JobListing])
async def list_jobs(
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
    limit: Annotated[int, Query(ge=1, le=50)] = 30,
) -> list[JobListing]:
    cursor = database.jobs.find({"status": {"$ne": "hidden"}}).sort("created_at", -1).limit(limit)
    return [_job_from_document(document) async for document in cursor]


@router.get("/{job_id}/rating", response_model=JobRating | None)
async def get_my_job_rating(
    job_id: str,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> JobRating | None:
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        return None
    rating = await database.job_ratings.find_one(
        {"job_listing_id": ObjectId(job_id), "user_id": profile["_id"]}
    )
    if rating is None:
        return None
    return JobRating(stars=rating["stars"], stale=rating["stale"])


@router.put("/{job_id}/rating", response_model=JobListing)
async def rate_job(
    job_id: str,
    payload: JobRatingCreate,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> JobListing:
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job_object_id = ObjectId(job_id)
    if await database.jobs.find_one({"_id": job_object_id}) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Create a user profile before rating a job",
        )

    now = datetime.now(UTC)
    previous = await database.job_ratings.find_one_and_update(
        {"job_listing_id": job_object_id, "user_id": profile["_id"]},
        {
            "$set": {"stars": payload.stars, "stale": payload.stale, "updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
        return_document=ReturnDocument.BEFORE,
    )
    star_delta = payload.stars - (previous["stars"] if previous else 0)
    stale_delta = int(payload.stale) - int(previous["stale"] if previous else False)
    count_delta = 0 if previous else 1
    document = await database.jobs.find_one_and_update(
        {"_id": job_object_id},
        {
            "$inc": {
                "rating_sum": star_delta,
                "rating_count": count_delta,
                "stale_votes": stale_delta,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return _job_from_document(document)


@router.get("/mine", response_model=list[JobListing])
async def list_my_jobs(
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> list[JobListing]:
    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        return []

    cursor = database.jobs.find({"submitter_id": profile["_id"]}).sort("created_at", -1)
    return [_job_from_document(document) async for document in cursor]


@router.put("/{job_id}", response_model=JobListing)
async def update_job(
    job_id: str,
    payload: JobListingCreate,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> JobListing:
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    external_url = str(payload.external_url)
    update = {
        **payload.model_dump(exclude={"external_url"}),
        "external_url": external_url,
        "canonical_url": _canonicalize_url(external_url),
        "updated_at": datetime.now(UTC),
    }
    try:
        document = await database.jobs.find_one_and_update(
            {"_id": ObjectId(job_id), "submitter_id": profile["_id"]},
            {"$set": update},
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A job with this URL already exists",
        ) from exc

    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return _job_from_document(document)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: str,
    user: CurrentUser,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> None:
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    profile = await database.users.find_one({"auth0_sub": user.sub})
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    result = await database.jobs.delete_one(
        {"_id": ObjectId(job_id), "submitter_id": profile["_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    await database.job_ratings.delete_many({"job_listing_id": ObjectId(job_id)})


@router.get("/{job_id}", response_model=JobListing)
async def get_job(
    job_id: str,
    database: Annotated[AsyncDatabase, Depends(get_ready_database)],
) -> JobListing:
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    document = await database.jobs.find_one({"_id": ObjectId(job_id)})
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return _job_from_document(document)
