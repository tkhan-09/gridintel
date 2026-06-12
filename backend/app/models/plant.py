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
    from app.models.meter import Meter
    from app.models.office import Office
    from app.models.omf_history import OMFHistory


# ------------------------------------------------------------------ #
# Enums (Python-side validation mirroring DB CHECK constraints)
# ------------------------------------------------------------------ #
class PlantStatus(str, enum.Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"
    UNDER_MAINTENANCE = "Under Maintenance"
    DECOMMISSIONED = "Decommissioned"


class FuelType(str, enum.Enum):
    GAS = "Gas"
    COAL = "Coal"
    WATER = "Water"
    DUAL_FUEL = "Dual Fuel"
    DIESEL = "Diesel"
    FURNACE_OIL = "Furnace Oil"
    SOLAR = "Solar"


class Technology(str, enum.Enum):
    COMBINED_CYCLE = "Combined Cycle"
    STEAM_TURBINE = "Steam Turbine"
    GAS_TURBINE = "Gas Turbine"
    HYDRO_TURBINE = "Hydro Turbine"
    SIMPLE_CYCLE = "Simple Cycle"
    DIESEL_ENGINE = "Diesel Engine"
    PHOTOVOLTAIC = "Photovoltaic"


class Ownership(str, enum.Enum):
    BPDB_OWN = "BPDB Own"
    IPP = "IPP"
    JOINT_VENTURE = "Joint Venture"
    NWPGCL = "NWPGCL"
    APSCL = "APSCL"
    EGCB = "EGCB"


class Plant(Base):
    """
    Power generation plant (generating station).

    One plant has many meters, many OMF history records, and one
    submission record per calendar month.
    """

    __tablename__ = "plants"
    __table_args__ = (
        UniqueConstraint("name", name="uq_plants_name"),
        CheckConstraint(
            "status IN ('Active','Inactive','Under Maintenance','Decommissioned')",
            name="ck_plants_status",
        ),
        CheckConstraint(
            "capacity_mw > 0",
            name="ck_plants_capacity_positive",
        ),
        Index("ix_plants_office_id", "office_id"),
        Index("ix_plants_status", "status"),
        Index("ix_plants_fuel_type", "fuel_type"),
    )

    # ------------------------------------------------------------------ #
    # Columns
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        index=True,
        comment="Full official plant name, e.g. 'Ashuganj 450MW Combined Cycle Power Plant'",
    )

    capacity_mw: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Installed / declared net capacity in megawatts",
    )

    fuel_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Primary fuel: Gas, Coal, Water, Dual Fuel, Diesel, Furnace Oil, Solar",
    )

    technology: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Generation technology: Combined Cycle, Steam Turbine, Hydro Turbine, etc.",
    )

    ownership: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Ownership category: BPDB Own, IPP, Joint Venture, NWPGCL, APSCL, EGCB",
    )

    sector: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Market sector: Public, Private, Public-Private",
    )

    grid_voltage: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Connection voltage to national grid: 400kV, 230kV, 132kV, etc.",
    )

    office_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("offices.id", ondelete="SET NULL"),
        nullable=True,
        comment="FK → offices.id; administrative circle responsible for this plant",
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=PlantStatus.ACTIVE.value,
        server_default="Active",
        comment="Operational status: Active | Inactive | Under Maintenance | Decommissioned",
    )

    # ------------------------------------------------------------------ #
    # Relationships
    # ------------------------------------------------------------------ #
    office: Mapped[Optional[Office]] = relationship(
        "Office",
        lazy="joined",
    )

    meters: Mapped[list[Meter]] = relationship(
        "Meter",
        lazy="select",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Meter.meter_type, Meter.meter_number",
    )

    omf_history: Mapped[list[OMFHistory]] = relationship(
        "OMFHistory",
        lazy="select",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="OMFHistory.effective_from.desc()",
    )

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def current_omf(self, as_of_date=None) -> Optional[OMFHistory]:
        """
        Return the OMFHistory record effective on *as_of_date*.
        Requires ``omf_history`` to be loaded (eager or explicit).
        If ``as_of_date`` is None, returns the record with ``effective_to IS NULL``.
        """
        from datetime import date

        target = as_of_date or date.today()
        for record in self.omf_history:
            if record.effective_from <= target:
                if record.effective_to is None or record.effective_to >= target:
                    return record
        return None

    @property
    def is_active(self) -> bool:
        return self.status == PlantStatus.ACTIVE.value

    @property
    def main_export_meters(self) -> list[Meter]:
        """Return only Main-type Export meters (used in energy balance)."""
        return [
            m for m in self.meters
            if m.meter_type == "Main" and m.direction == "Export"
        ]
