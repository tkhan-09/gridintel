from __future__ import annotations
from datetime import datetime
from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class CrossBorderCircuit(Base):
    __tablename__ = "cross_border_circuits"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    from_country: Mapped[str] = mapped_column(String(100), nullable=True)
    to_country: Mapped[str] = mapped_column(String(100), nullable=True)
    capacity_mw: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CrossBorderReading(Base):
    __tablename__ = "cross_border_readings"
    __table_args__ = (
        UniqueConstraint("circuit_name", "month", "year", name="uq_cross_border_circuit_month_year"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    circuit_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    opening_reading: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    closing_reading: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    active_energy_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    billing_net_energy_kwh: Mapped[float] = mapped_column(Float, nullable=True, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)