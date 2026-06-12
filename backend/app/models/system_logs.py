"""System Logs — consolidated transactional log and metadata models.

Includes: Adjustment, AuditLog, AnomalyAlert, Notification, Forecast, Report, RAGDocument.
"""
from __future__ import annotations

import enum
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


# ---------------------------------------------------------------------------
# Adjustment
# ---------------------------------------------------------------------------

class Adjustment(Base):
    __tablename__ = "adjustments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    original_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    adjusted_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    approved_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approval_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    approver: Mapped["User | None"] = relationship("User", foreign_keys=[approved_by])  # noqa: F821

    def __repr__(self) -> str:
        return f"<Adjustment entity={self.entity_type}/{self.entity_id} field={self.field_name}>"


# ---------------------------------------------------------------------------
# AuditLog
# ---------------------------------------------------------------------------

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    table_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    record_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    old_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    actor: Mapped["User | None"] = relationship("User", foreign_keys=[user_id])  # noqa: F821

    def __repr__(self) -> str:
        return f"<AuditLog action={self.action} table={self.table_name} record={self.record_id}>"


# ---------------------------------------------------------------------------
# AnomalyAlert
# ---------------------------------------------------------------------------

class AlertSeverity(str, enum.Enum):
    Low = "Low"
    Medium = "Medium"
    High = "High"
    Critical = "Critical"


class AnomalyAlert(Base):
    __tablename__ = "anomaly_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="alert_severity_enum"),
        nullable=False,
        default=AlertSeverity.Medium,
        index=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    resolved_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    resolver: Mapped["User | None"] = relationship("User", foreign_keys=[resolved_by])  # noqa: F821

    def __repr__(self) -> str:
        return f"<AnomalyAlert type={self.type} severity={self.severity} resolved={self.is_resolved}>"


# ---------------------------------------------------------------------------
# Notification
# ---------------------------------------------------------------------------

class NotificationType(str, enum.Enum):
    Info = "Info"
    Warning = "Warning"
    Alert = "Alert"
    Deadline = "Deadline"
    System = "System"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type_enum"),
        nullable=False,
        default=NotificationType.Info,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    recipient: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # noqa: F821

    def __repr__(self) -> str:
        return f"<Notification user_id={self.user_id} title={self.title!r} read={self.is_read}>"


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------

class Forecast(Base):
    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    target_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    horizon_month: Mapped[int] = mapped_column(Integer, nullable=False)
    horizon_year: Mapped[int] = mapped_column(Integer, nullable=False)

    predicted_value: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_interval_lower: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_interval_upper: Mapped[float | None] = mapped_column(Float, nullable=True)

    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<Forecast target={self.target_type}/{self.target_id} {self.horizon_month}/{self.horizon_year} pred={self.predicted_value}>"


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

class ReportType(str, enum.Enum):
    MODSummary = "MODSummary"
    EnergyBalance = "EnergyBalance"
    Billing = "Billing"
    CrossBorder = "CrossBorder"
    UtilitySales = "UtilitySales"
    Forecast = "Forecast"
    AuditTrail = "AuditTrail"
    AnomalySummary = "AnomalySummary"
    PlantPerformance = "PlantPerformance"
    LossAnalysis = "LossAnalysis"
    FuelConsumption = "FuelConsumption"
    Custom = "Custom"


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[ReportType] = mapped_column(
        Enum(ReportType, name="report_type_enum"),
        nullable=False,
        index=True,
    )
    generated_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    context_filters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    generator: Mapped["User | None"] = relationship("User", foreign_keys=[generated_by])  # noqa: F821

    def __repr__(self) -> str:
        return f"<Report title={self.title!r} type={self.type}>"


# ---------------------------------------------------------------------------
# RAGDocument
# ---------------------------------------------------------------------------

class RAGDocumentType(str, enum.Enum):
    Policy = "Policy"
    Manual = "Manual"
    Regulation = "Regulation"
    TariffOrder = "TariffOrder"
    TechnicalSpec = "TechnicalSpec"
    Other = "Other"


class RAGDocument(Base):
    __tablename__ = "rag_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    doc_type: Mapped[RAGDocumentType] = mapped_column(
        Enum(RAGDocumentType, name="rag_doc_type_enum"),
        nullable=False,
        default=RAGDocumentType.Other,
        index=True,
    )
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # pgvector embedding column (1536-dim for OpenAI-compatible, 768 for smaller models)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)

    def __repr__(self) -> str:
        return f"<RAGDocument title={self.title!r} type={self.doc_type}>"
