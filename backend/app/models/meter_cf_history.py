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
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.meter import Meter


class MeterCFHistory(Base):
    """
    Correction Factor (CF) history for an individual meter.

    The correction factor accounts for accumulated metering error identified
    during periodic calibration tests.  It is applied multiplicatively to the
    raw energy reading:

        net_kWh = (closing − opening) × multiplier × correction_factor

    A fresh meter typically has CF = 1.000000.  Post-calibration adjustments
    are recorded here as a new record so that historical recalculations remain
    accurate.

    The date ranges for a given meter must not overlap; the application layer
    enforces this before insert.
    """

    __tablename__ = "meter_cf_history"
    __table_args__ = (
        CheckConstraint(
            "correction_factor > 0",
            name="ck_meter_cf_positive",
        ),
        CheckConstraint(
            "effective_to IS NULL OR effective_to > effective_from",
            name="ck_meter_cf_date_order",
        ),
        Index("ix_meter_cf_meter_id", "meter_id"),
        Index("ix_meter_cf_effective_from", "effective_from"),
    )

    # ------------------------------------------------------------------ #
    # Columns
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    meter_id: Mapped[int] = mapped_column(
        ForeignKey("meters.id", ondelete="CASCADE"),
        nullable=False,
        comment="FK → meters.id; correction factor record belongs to this meter",
    )

    correction_factor: Mapped[float] = mapped_column(
        Numeric(10, 6),
        nullable=False,
        default=1.0,
        server_default="1.000000",
        comment="Multiplicative CF applied to net energy reading. "
                "Nominal value is 1.000000; deviations indicate calibration error.",
    )

    effective_from: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="First calendar date this CF is in force (inclusive)",
    )

    effective_to: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        default=None,
        comment="Last calendar date this CF is in force (inclusive). "
                "NULL = currently active.",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="UTC timestamp of record creation",
    )

    # ------------------------------------------------------------------ #
    # Relationships
    # ------------------------------------------------------------------ #
    meter: Mapped[Meter] = relationship(
        "Meter",
        lazy="joined",
        innerjoin=True,
    )

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    @property
    def is_current(self) -> bool:
        """True if this CF record is open-ended (currently active)."""
        return self.effective_to is None

    def is_effective_on(self, target_date: date) -> bool:
        """Return True if *target_date* falls within this record's validity range."""
        if target_date < self.effective_from:
            return False
        if self.effective_to is not None and target_date > self.effective_to:
            return False
        return True

    @property
    def deviation_pct(self) -> float:
        """
        Return the CF deviation from unity expressed as a percentage.

        Positive = meter over-reads.  Negative = meter under-reads.
        e.g.  CF = 1.000120  →  deviation_pct = +0.012 %
        """
        return round((float(self.correction_factor) - 1.0) * 100, 6)

    @property
    def has_significant_deviation(self) -> bool:
        """
        Return True if |deviation| > 0.05 % — the threshold used by
        BPDB anomaly detection to flag a meter for recalibration.
        """
        return abs(self.deviation_pct) > 0.05
