from fastapi import Request
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.config import Settings


def create_mongo_client(settings: Settings) -> AsyncMongoClient:
    return AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5_000)


def get_mongo_client(request: Request) -> AsyncMongoClient:
    return request.app.state.mongo_client


def get_database(request: Request) -> AsyncDatabase:
    return request.app.state.database
