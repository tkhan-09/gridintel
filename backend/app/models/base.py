from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


class Base(DeclarativeBase):
    """
    Shared declarative base for all GridIntel ORM models.

    All models should inherit from this class.  The ``type_annotation_map``
    ensures that Python ``datetime`` columns always use timezone-aware
    TIMESTAMPTZ in PostgreSQL.
    """

    type_annotation_map: dict[Any, Any] = {
        datetime: DateTime(timezone=True),
    }

    def __repr__(self) -> str:
        cls = type(self).__name__
        pk_cols = [
            c.key
            for c in self.__table__.columns  # type: ignore[attr-defined]
            if c.primary_key
        ]
        pk_vals = ", ".join(
            f"{k}={getattr(self, k, '?')!r}" for k in pk_cols
        )
        return f"<{cls} {pk_vals}>"

    def to_dict(self) -> dict[str, Any]:
        """Shallow serialisation helper (avoids lazy-load on relationships)."""
        return {
            c.key: getattr(self, c.key)
            for c in self.__table__.columns  # type: ignore[attr-defined]
        }


# ------------------------------------------------------------------ #
# Re-export for convenience:
#   from app.models.base import Base, TimestampMixin, SoftDeleteMixin
# ------------------------------------------------------------------ #

class TimestampMixin:
    """
    Adds ``created_at`` and ``updated_at`` columns that are managed
    automatically by the database server (no application-side triggers
    needed beyond what the DB already provides).
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        index=False,
    )
