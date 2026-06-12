"""Billing model — invoice records per entity per month."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BillingEntityType(str, enum.Enum):
    Utility = "Utility"
    CrossBorder = "CrossBorder"
    Internal = "Internal"
    Plant = "Plant"


class BillingStatus(str, enum.Enum):
    DRAFT = "draft"
    FINAL = "final"
    PAID = "paid"


class Billing(Base):
    __tablename__ = "billing"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "month", "year", name="uq_billing_entity_month_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entity_type: Mapped[BillingEntityType] = mapped_column(
        Enum(BillingEntityType, name="billing_entity_type_enum"),
        nullable=False, index=True,
    )
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_per_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    gross_bill: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_deductions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_bill: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    outstanding_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    invoice_pdf_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


# Alias
BillingRecord = Billing


class FuelDeduction(Base):
    __tablename__ = "fuel_deductions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    billing_id: Mapped[int] = mapped_column(Integer, nullable=True)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PenaltyDeduction(Base):
    __tablename__ = "penalty_deductions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    billing_id: Mapped[int] = mapped_column(Integer, nullable=True)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    billing_id: Mapped[int] = mapped_column(Integer, nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)