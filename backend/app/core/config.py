from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import AnyHttpUrl, EmailStr, Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # Application
    # ------------------------------------------------------------------ #
    APP_ENV: str = Field(default="development")
    APP_DEBUG: bool = Field(default=False)
    APP_HOST: str = Field(default="0.0.0.0")
    APP_PORT: int = Field(default=8000)
    APP_TITLE: str = "GridIntel API"
    APP_VERSION: str = "1.0.0"
    APP_DESCRIPTION: str = "BPDB Power Grid Intelligence Platform"

    ALLOWED_ORIGINS: str = Field(default="http://localhost:3000")

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    POSTGRES_USER: str = Field(default="gridintel")
    POSTGRES_PASSWORD: str = Field(default="Gr1dInt3l@2024!")
    POSTGRES_DB: str = Field(default="gridintel_db")
    POSTGRES_HOST: str = Field(default="db")
    POSTGRES_PORT: int = Field(default=5432)

    # Connection pool tuning
    DB_POOL_SIZE: int = Field(default=10)
    DB_MAX_OVERFLOW: int = Field(default=20)
    DB_POOL_TIMEOUT: int = Field(default=30)
    DB_POOL_RECYCLE: int = Field(default=1800)
    DB_ECHO: bool = Field(default=False)

    @property
    def async_database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def sync_database_url(self) -> str:
        """Used by Alembic migrations (sync driver)."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ------------------------------------------------------------------ #
    # Redis
    # ------------------------------------------------------------------ #
    REDIS_URL: str = Field(default="redis://redis:6379/0")
    REDIS_MAX_CONNECTIONS: int = Field(default=20)

    # ------------------------------------------------------------------ #
    # Security / JWT
    # ------------------------------------------------------------------ #
    JWT_SECRET: str = Field(
        default="change-this-to-a-secure-random-256-bit-secret-key-in-production"
    )
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)

    # Password reset token TTL in seconds (1 hour)
    PASSWORD_RESET_TOKEN_EXPIRE_SECONDS: int = Field(default=3600)

    # Bcrypt rounds
    BCRYPT_ROUNDS: int = Field(default=12)

    # ------------------------------------------------------------------ #
    # External AI APIs
    # ------------------------------------------------------------------ #
    GROQ_API_KEY: str = Field(default="")
    GEMINI_API_KEY: str = Field(default="")
    OPENROUTER_API_KEY: str = Field(default="")

    # Default model identifiers
    GROQ_MODEL: str = Field(default="llama-3.3-70b-versatile")
    GEMINI_MODEL: str = Field(default="gemini-1.5-flash")

    # ------------------------------------------------------------------ #
    # OCR Service
    # ------------------------------------------------------------------ #
    OCR_SERVICE_URL: str = Field(default="http://ocr-service:8001")
    OCR_REQUEST_TIMEOUT: int = Field(default=60)

    # ------------------------------------------------------------------ #
    # Anomaly Detection Thresholds
    # ------------------------------------------------------------------ #
    LOSS_THRESHOLD_PERCENT: float = Field(
        default=16.0,
        ge=0.0,
        le=100.0,
        description="System loss % above which a Critical alert is raised",
    )
    AUXILIARY_SPIKE_THRESHOLD: float = Field(
        default=8.0,
        ge=0.0,
        le=100.0,
        description="Auxiliary consumption % above which a Warning alert is raised",
    )
    GENERATION_DROP_THRESHOLD: float = Field(
        default=20.0,
        ge=0.0,
        le=100.0,
        description="Generation drop % vs forecast above which a Warning alert is raised",
    )

    # Warning boundaries (below critical threshold)
    LOSS_WARNING_PERCENT: float = Field(default=12.0)
    AUXILIARY_WARNING_THRESHOLD: float = Field(default=6.0)

    # ------------------------------------------------------------------ #
    # File Storage
    # ------------------------------------------------------------------ #
    UPLOAD_DIR: str = Field(default="/app/uploads")
    MAX_UPLOAD_SIZE_MB: int = Field(default=50)

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    # ------------------------------------------------------------------ #
    # Pagination defaults
    # ------------------------------------------------------------------ #
    DEFAULT_PAGE_SIZE: int = Field(default=20)
    MAX_PAGE_SIZE: int = Field(default=200)

    # ------------------------------------------------------------------ #
    # Validators
    # ------------------------------------------------------------------ #
    @field_validator("APP_ENV")
    @classmethod
    def validate_env(cls, v: str) -> str:
        allowed = {"development", "staging", "production"}
        if v not in allowed:
            raise ValueError(f"APP_ENV must be one of {allowed}")
        return v

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return a cached Settings instance.
    Call ``get_settings.cache_clear()`` in tests to reset.
    """
    return Settings()


# Module-level convenience alias so callers can do:
#   from app.core.config import settings
settings: Settings = get_settings()
