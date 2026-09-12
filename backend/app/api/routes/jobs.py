from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import urlsplit, urlunsplit

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.auth.dependencies import CurrentUser
from app.db.mongodb import get_ready_database
from app.models.job import JobListing, JobListingCreate
from app.services.rate_limit import RateLimitExceeded, consume_job_post

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_from_document(document: dict) -> JobListing:
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
