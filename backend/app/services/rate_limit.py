from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

JOB_POST_LIMIT = 5
JOB_POST_WINDOW_SECONDS = 60 * 60


@dataclass(frozen=True)
class RateLimitExceeded(Exception):
    retry_after_seconds: int


async def consume_job_post(
    database: AsyncDatabase,
    user_id: ObjectId,
    *,
    now: datetime | None = None,
) -> None:
    current_time = now or datetime.now(UTC)
    window_timestamp = (
        int(current_time.timestamp()) // JOB_POST_WINDOW_SECONDS * JOB_POST_WINDOW_SECONDS
    )
    window_start = datetime.fromtimestamp(window_timestamp, UTC)
    window_end = window_start + timedelta(seconds=JOB_POST_WINDOW_SECONDS)

    try:
        await database.rate_limits.find_one_and_update(
            {
                "user_id": user_id,
                "action": "job.post",
                "window_start": window_start,
                "count": {"$lt": JOB_POST_LIMIT},
            },
            {
                "$inc": {"count": 1},
                "$setOnInsert": {"expires_at": window_end + timedelta(hours=1)},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        retry_after = max(1, int((window_end - current_time).total_seconds()))
        raise RateLimitExceeded(retry_after) from exc
