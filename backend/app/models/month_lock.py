"""Month Lock model — prevents direct edits once a month is locked."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class MonthLock(Base):
    __tablename__ = "month_locks"
    __table_args__ = (
        UniqueConstraint("month", "year", name="uq_month_lock_month_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    locked_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    locker: Mapped["User | None"] = relationship("User", foreign_keys=[locked_by])  # noqa: F821

    def __repr__(self) -> str:
        return f"<MonthLock {self.month}/{self.year} locked={self.is_locked}>"
