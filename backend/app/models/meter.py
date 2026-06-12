from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.meter_cf_history import MeterCFHistory
    from app.models.mod_reading import MODReading
    from app.models.plant import Plant


# ------------------------------------------------------------------ #
# Enums mirroring the DB CHECK constraints
# ------------------------------------------------------------------ #
class MeterType(str, enum.Enum):
    MAIN = "Main"
    CHECK = "Check"
    STANDBY = "Standby"


class MeterDirection(str, enum.Enum):
    EXPORT = "Export"
    IMPORT = "Import"
    STATION = "Station"


class Meter(Base):
    """
    Energy meter installed at a plant.

    Meter hierarchy (per plant per direction):
    - **Main**    — Primary billing meter; used for all energy calculations.
    - **Check**   — Independent parallel meter; used to cross-validate Main.
    - **Standby** — Hot-standby; activated only when Main/Check are removed
                    for calibration.

    ``multiplier`` is the meter's current transformer (CT) × potential
    transformer (PT) ratio used to convert pulse counts / dial readings to
    actual kWh.

    ``direction`` distinguishes:
    - **Export**  — Energy sent to the national grid (generation output).
    - **Import**  — Energy received from the grid (rare for generators).
    - **Station** — Auxiliary/station consumption meters.
    """

    __tablename__ = "meters"
    __table_args__ = (
        UniqueConstraint("meter_number", name="uq_meters_meter_number"),
        CheckConstraint(
            "meter_type IN ('Main','Check','Standby')",
            name="ck_meters_meter_type",
        ),
        CheckConstraint(
            "direction IN ('Export','Import','Station')",
            name="ck_meters_direction",
        ),
        CheckConstraint(
            "multiplier > 0",
            name="ck_meters_multiplier_positive",
        ),
        Index("ix_meters_plant_id", "plant_id"),
        Index("ix_meters_meter_type", "meter_type"),
        Index("ix_meters_direction", "direction"),
    )

    # ------------------------------------------------------------------ #
    # Columns
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plants.id", ondelete="CASCADE"),
        nullable=False,
        comment="FK → plants.id; every meter belongs to exactly one plant",
    )

    meter_number: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Physical meter serial / asset tag, e.g. 'ASH-450-M01'",
    )

    meter_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Main | Check | Standby",
    )

    multiplier: Mapped[float] = mapped_column(
        Numeric(10, 4),
        nullable=False,
        default=1.0,
        comment="CT×PT ratio; dial reading × multiplier = actual energy in kWh",
    )

    direction: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Export | Import | Station",
    )

    # ------------------------------------------------------------------ #
    # Relationships
    # ------------------------------------------------------------------ #
    plant: Mapped[Plant] = relationship(
        "Plant",
        lazy="joined",
        innerjoin=True,
    )

    cf_history: Mapped[list[MeterCFHistory]] = relationship(
        "MeterCFHistory",
        lazy="select",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MeterCFHistory.effective_from.desc()",
    )

    readings: Mapped[list[MODReading]] = relationship(
        "MODReading",
        lazy="select",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MODReading.year.desc(), MODReading.month.desc()",
    )

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    @property
    def is_main(self) -> bool:
        return self.meter_type == MeterType.MAIN.value

    @property
    def is_export(self) -> bool:
        return self.direction == MeterDirection.EXPORT.value

    @property
    def is_station(self) -> bool:
        return self.direction == MeterDirection.STATION.value

    def current_cf(self, as_of_date=None) -> Optional[MeterCFHistory]:
        """
        Return the correction-factor record effective on *as_of_date*.
        Requires ``cf_history`` to be loaded.
        Returns the open-ended record (``effective_to IS NULL``) by default.
        """
        from datetime import date

        target = as_of_date or date.today()
        for record in self.cf_history:
            if record.effective_from <= target:
                if record.effective_to is None or record.effective_to >= target:
                    return record
        return None

    def compute_energy_kwh(
        self,
        opening: float,
        closing: float,
        correction_factor: float = 1.0,
    ) -> float:
        """
        Convert raw dial readings to net kWh using this meter's multiplier
        and an externally supplied correction factor.

        net_kWh = (closing - opening) × multiplier × correction_factor
        """
        return (closing - opening) * float(self.multiplier) * correction_factor
