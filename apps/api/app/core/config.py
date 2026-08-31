from enum import StrEnum
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, HttpUrl, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Application configuration, loaded from the environment.

    Secrets are typed as ``SecretStr`` so they are redacted in reprs, logs and
    tracebacks. Nothing here is ever serialised into an API response.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Service -----------------------------------------------------------
    service_name: str = "clinical-copilot-api"
    version: str = "0.1.0"
    environment: Environment = Environment.LOCAL
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # --- Supabase ----------------------------------------------------------
    supabase_url: HttpUrl | None = None
    # Bypasses Row Level Security. Backend only — never sent to the frontend.
    supabase_service_role_key: SecretStr | None = None
    # Needed as the `apikey` header when asking the Auth server to validate a
    # token, which is the required path for symmetric-key projects.
    supabase_anon_key: SecretStr | None = None
    # Only for projects still on the legacy shared HS256 secret. Modern
    # projects use asymmetric signing keys and verify via JWKS instead.
    supabase_jwt_secret: SecretStr | None = None
    supabase_jwt_audience: str = "authenticated"
    # The JWKS endpoint is edge-cached for 10 minutes upstream, so caching for
    # less than that buys nothing.
    jwks_cache_seconds: Annotated[int, Field(ge=60, le=3600)] = 600

    # --- Database ----------------------------------------------------------
    database_url: SecretStr | None = None
    database_pool_min_size: Annotated[int, Field(ge=0, le=50)] = 1
    database_pool_max_size: Annotated[int, Field(ge=1, le=100)] = 10

    # --- HTTP --------------------------------------------------------------
    cors_allow_origins: list[str] = ["http://localhost:3000"]

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept a comma-separated string, which is how ECS task env vars
        and .env files realistically carry a list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment is Environment.PRODUCTION

    @property
    def supabase_base_url(self) -> str:
        """Supabase URL without a trailing slash, for building endpoints."""
        if self.supabase_url is None:
            raise ValueError("SUPABASE_URL is not configured")
        return str(self.supabase_url).rstrip("/")

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_base_url}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"

    @property
    def docs_enabled(self) -> bool:
        """Interactive docs are disabled in production: the schema describes
        every PHI endpoint and is not useful to an anonymous caller."""
        return not self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()
