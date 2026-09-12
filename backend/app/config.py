from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    mongodb_uri: str
    mongodb_database: str = "job_application_game"
    auth0_domain: str
    auth0_audience: str
    frontend_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "https://the-job-rooms.vercel.app"])

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("auth0_domain")
    @classmethod
    def normalize_auth0_domain(cls, value: str) -> str:
        return value.removeprefix("https://").removeprefix("http://").rstrip("/")

    @field_validator("frontend_origins")
    @classmethod
    def normalize_frontend_origins(cls, values: list[str]) -> list[str]:
        origins = [value.rstrip("/") for value in values if value.strip()]
        if not origins:
            raise ValueError("At least one frontend origin is required")
        return origins

    @property
    def auth0_issuer(self) -> str:
        return f"https://{self.auth0_domain}/"

    @property
    def auth0_jwks_url(self) -> str:
        return f"{self.auth0_issuer}.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
