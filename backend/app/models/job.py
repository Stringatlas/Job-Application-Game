from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


class JobListingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    company: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1, max_length=120)
    remote: bool = False
    external_url: HttpUrl
    description: str | None = Field(default=None, max_length=5_000)
    tags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("external_url")
    @classmethod
    def require_https(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https":
            raise ValueError("external_url must use https")
        return value

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip().lower() for value in values if value.strip()]
        if any(len(value) > 40 for value in cleaned):
            raise ValueError("tags must be at most 40 characters")
        return list(dict.fromkeys(cleaned))


class JobRatingCreate(BaseModel):
    stars: int = Field(ge=1, le=5)
    stale: bool = False


class JobRating(BaseModel):
    stars: int
    stale: bool


class JobListing(BaseModel):
    id: str
    title: str
    company: str
    location: str
    remote: bool
    external_url: HttpUrl
    description: str | None = None
    tags: list[str]
    submitter_id: str
    status: Literal["active", "possibly_stale", "hidden"]
    useful_votes: int
    stale_votes: int
    average_rating: float | None = None
    rating_count: int = 0
    created_at: datetime
    updated_at: datetime
