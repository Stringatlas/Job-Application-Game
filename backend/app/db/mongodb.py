import asyncio

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from starlette.requests import HTTPConnection

from app.config import Settings


def create_mongo_client(settings: Settings) -> AsyncMongoClient:
    return AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5_000)


def get_mongo_client(connection: HTTPConnection) -> AsyncMongoClient:
    return connection.app.state.mongo_client


def get_database(connection: HTTPConnection) -> AsyncDatabase:
    return connection.app.state.database


async def get_ready_database(connection: HTTPConnection) -> AsyncDatabase:
    """Return the database after lazily ensuring its required indexes exist."""
    database = get_database(connection)
    if connection.app.state.mongo_indexes_ready:
        return database

    async with connection.app.state.mongo_index_lock:
        if not connection.app.state.mongo_indexes_ready:
            await ensure_indexes(database)
            connection.app.state.mongo_indexes_ready = True
    return database


def initialize_database_state(request_app: object) -> None:
    # Kept separate so the app can still serve /health while MongoDB is unavailable.
    request_app.state.mongo_indexes_ready = False
    request_app.state.mongo_index_lock = asyncio.Lock()


async def ensure_indexes(database: AsyncDatabase) -> None:
    """Create the small set of indexes that enforce the MVP data model."""
    await database.users.create_index("auth0_sub", unique=True)
    await database.users.create_index("username_key", unique=True)
    await database.jobs.create_index("canonical_url", unique=True)
    await database.jobs.create_index([("status", 1), ("created_at", -1)])
    await database.jobs.create_index([("submitter_id", 1), ("created_at", -1)])
    await database.job_ratings.create_index(
        [("user_id", 1), ("job_listing_id", 1)],
        unique=True,
    )
    await database.job_applications.create_index(
        [("user_id", 1), ("job_listing_id", 1)],
        unique=True,
    )
    await database.rate_limits.create_index(
        [("user_id", 1), ("action", 1), ("window_start", 1)],
        unique=True,
    )
    await database.rate_limits.create_index("expires_at", expireAfterSeconds=0)
