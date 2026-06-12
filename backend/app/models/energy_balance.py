"""Energy Balance model — system-wide monthly energy accounting summary."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class EnergyBalance(Base):
    __tablename__ = "energy_balance"
    __table_args__ = (
        UniqueConstraint("month", "year", name="uq_energy_balance_month_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    total_generation_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_import_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_available_energy_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_utility_sales_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    system_loss_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    system_loss_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<EnergyBalance {self.month}/{self.year} loss={self.system_loss_percent:.2f}%>"
