from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.plant import Plant
    from app.models.user import User


class OMFHistory(Base):
    """
    Operational Maintenance Factor (OMF) history for a plant.

    OMF is a dimensionless coefficient (0 – 1) applied to gross generation
    to derive the net contractual generation used in billing calculations.

    Each record represents a date range ``[effective_from, effective_to)``
    during which a specific OMF value was in force.  An open-ended record
    (``effective_to IS NULL``) is the **current** OMF for that plant.

    The database enforces non-overlapping ranges via an EXCLUDE constraint
    (see ``indexes.sql``).  The application layer should also validate this
    before insert/update to surface friendly validation errors.

    Fixed Gap 1 — this table was identified as missing from earlier
    billing logic and has been added as a first-class entity.
    """

    __tablename__ = "omf_history"
    __table_args__ = (
        CheckConstraint(
            "omf_value >= 0 AND omf_value <= 1",
            name="ck_omf_value_range",
        ),
        CheckConstraint(
            "effective_to IS NULL OR effective_to > effective_from",
            name="ck_omf_date_order",
        ),
        Index("ix_omf_plant_id", "plant_id"),
        Index("ix_omf_effective_from", "effective_from"),
        Index("ix_omf_plant_date_range", "plant_id", "effective_from", "effective_to"),
    )

    # ------------------------------------------------------------------ #
    # Columns
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plants.id", ondelete="CASCADE"),
        nullable=False,
        comment="FK → plants.id; OMF record belongs to this plant",
    )

    omf_value: Mapped[float] = mapped_column(
        Numeric(6, 4),
        nullable=False,
        comment="OMF coefficient between 0.0000 and 1.0000 (e.g. 0.9350 = 93.5%)",
    )

    effective_from: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="First calendar date this OMF value is in effect (inclusive)",
    )

    effective_to: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        default=None,
        comment="Last calendar date this OMF value is in effect (inclusive). "
                "NULL means currently active / open-ended.",
    )

    changed_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="FK → users.id; user who set this OMF value",
    )

    change_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Free-text rationale for the OMF change (e.g. annual revision, post-overhaul)",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="UTC timestamp when this record was inserted",
    )

    # ------------------------------------------------------------------ #
    # Relationships
    # ------------------------------------------------------------------ #
    plant: Mapped[Plant] = relationship(
        "Plant",
        lazy="joined",
        innerjoin=True,
    )

    changed_by_user: Mapped[Optional[User]] = relationship(
        "User",
        foreign_keys=[changed_by],
        lazy="select",
    )

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    @property
    def is_current(self) -> bool:
        """True if this record has no end date (open-ended / currently active)."""
        return self.effective_to is None

    def is_effective_on(self, target_date: date) -> bool:
        """Return True if *target_date* falls within this record's range."""
        if target_date < self.effective_from:
            return False
        if self.effective_to is not None and target_date > self.effective_to:
            return False
        return True

    @property
    def omf_percent(self) -> float:
        """Return OMF expressed as a percentage (e.g. 0.9350 → 93.50)."""
        return round(float(self.omf_value) * 100, 4)
