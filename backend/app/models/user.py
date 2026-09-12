from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=3,
        max_length=30,
        pattern=r"^[A-Za-z0-9_]+$",
    ),
]


class AuthenticatedUser(BaseModel):
    sub: str
    display_name: str | None = None
    email: str | None = None


class UserProfileUpdate(BaseModel):
    username: Username
    display_name: str | None = Field(default=None, min_length=1, max_length=80)


class UserProfile(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    created_at: datetime
    updated_at: datetime


class JobApplicationCreate(BaseModel):
    job_listing_id: str
    status: Literal["applied", "interviewing", "offer", "rejected", "withdrawn"] = "applied"


class JobApplication(BaseModel):
    id: str
    user_id: str
    job_listing_id: str
    status: Literal["applied", "interviewing", "offer", "rejected", "withdrawn"]
    applied_at: datetime
    updated_at: datetime
