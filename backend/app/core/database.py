from __future__ import annotations

import contextlib
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings


# ------------------------------------------------------------------ #
# Engine
# ------------------------------------------------------------------ #
def _build_engine(use_null_pool: bool = False) -> AsyncEngine:
    """
    Build the async SQLAlchemy engine.

    ``use_null_pool=True`` is used by Alembic/test contexts where a
    persistent connection pool is undesirable.
    """
    kwargs: dict = {
        "echo": settings.DB_ECHO,
        "future": True,
    }

    if use_null_pool:
        kwargs["poolclass"] = NullPool
    else:
        kwargs.update(
            {
                "pool_size": settings.DB_POOL_SIZE,
                "max_overflow": settings.DB_MAX_OVERFLOW,
                "pool_timeout": settings.DB_POOL_TIMEOUT,
                "pool_recycle": settings.DB_POOL_RECYCLE,
                "pool_pre_ping": True,
            }
        )

    return create_async_engine(settings.async_database_url, **kwargs)


engine: AsyncEngine = _build_engine()

# ------------------------------------------------------------------ #
# Session factory
# ------------------------------------------------------------------ #
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


# ------------------------------------------------------------------ #
# Declarative Base
# ------------------------------------------------------------------ #
class Base(DeclarativeBase):
    """
    Shared declarative base for all ORM models.
    Import this in every model module:
        from app.core.database import Base
    """
    pass


# ------------------------------------------------------------------ #
# FastAPI Dependency
# ------------------------------------------------------------------ #
async def get_db():
    """
    Yield an AsyncSession for use as a FastAPI dependency.

    Usage:
        @router.get("/example")
        async def example(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ------------------------------------------------------------------ #
# Context managers for non-request contexts (workers, scripts)
# ------------------------------------------------------------------ #
@contextlib.asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager for use outside of FastAPI request cycle.
    Suitable for ARQ workers, CLI scripts, and scheduled tasks.

    Usage:
        async with get_db_context() as db:
            result = await db.execute(...)
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@contextlib.asynccontextmanager
async def get_connection_context() -> AsyncGenerator[AsyncConnection, None]:
    """
    Yield a raw AsyncConnection — used by Alembic migration scripts
    or bulk DDL operations that bypass the ORM layer.
    """
    async with engine.begin() as conn:
        yield conn


# ------------------------------------------------------------------ #
# Lifecycle helpers (called from app startup/shutdown)
# ------------------------------------------------------------------ #
async def create_all_tables() -> None:
    """Create all tables defined in the Base metadata (dev/test only)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_engine() -> None:
    """Dispose the engine connection pool on application shutdown."""
    await engine.dispose()


# Alias for backwards compatibility
get_async_session = get_db

# Backwards compatibility alias
get_async_session = get_db

from typing import Annotated
from fastapi import Depends
DBSession = Annotated[AsyncSession, Depends(get_db)]