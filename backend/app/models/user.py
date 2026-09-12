from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    sub: str
    display_name: str | None = None
    email: str | None = None
