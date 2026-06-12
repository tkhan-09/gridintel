"""Utility Sales model — bulk energy sales to distribution utilities per month."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UtilitySales(Base):
    __tablename__ = "utility_sales"
    __table_args__ = (
        UniqueConstraint("utility_name", "bulk_supply_point", "month", "year", name="uq_utility_sales_point_month_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    utility_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    bulk_supply_point: Mapped[str] = mapped_column(String(255), nullable=False)
    active_energy_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    peak_demand_mw: Mapped[float] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<UtilitySales utility={self.utility_name} {self.month}/{self.year}>"

UtilitySalesAllocation = UtilitySales
