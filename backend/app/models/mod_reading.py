"""MOD Reading model — monthly meter readings per meter."""
from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class MODReading(Base):
    __tablename__ = "mod_readings"
    __table_args__ = (
        UniqueConstraint("meter_id", "month", "year", name="uq_mod_reading_meter_month_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meter_id: Mapped[int] = mapped_column(Integer, ForeignKey("meters.id", ondelete="CASCADE"), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    opening_reading: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    closing_reading: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    advanced_reading: Mapped[float] = mapped_column(Float, nullable=True)

    active_energy_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    reactive_energy_kvarh: Mapped[float] = mapped_column(Float, nullable=True, default=0.0)

    # Relationships
    meter: Mapped["Meter"] = relationship("Meter")  # noqa: F821

    def __repr__(self) -> str:
        return f"<MODReading meter_id={self.meter_id} {self.month}/{self.year}>"

ModReading = MODReading
