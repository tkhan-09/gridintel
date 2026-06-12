"""MOD Submission model — monthly data submission workflow per plant."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class SubmissionStatus(str, enum.Enum):
    Draft = "Draft"
    Submitted = "Submitted"
    Verified = "Verified"
    Locked = "Locked"


class MODSubmission(Base):
    __tablename__ = "mod_submissions"
    __table_args__ = (
        UniqueConstraint("plant_id", "month", "year", name="uq_mod_submission_plant_month_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plant_id: Mapped[int] = mapped_column(Integer, ForeignKey("plants.id", ondelete="CASCADE"), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, name="submission_status_enum"),
        nullable=False,
        default=SubmissionStatus.Draft,
        index=True,
    )

    submitted_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    verified_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant")  # noqa: F821
    submitter: Mapped["User | None"] = relationship("User", foreign_keys=[submitted_by])  # noqa: F821
    verifier: Mapped["User | None"] = relationship("User", foreign_keys=[verified_by])  # noqa: F821

    def __repr__(self) -> str:
        return f"<MODSubmission plant_id={self.plant_id} {self.month}/{self.year} status={self.status}>"

ModSubmission = MODSubmission
