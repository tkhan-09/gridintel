from __future__ import annotations
import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.core.database import Base

class AlertSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AnomalyAlert(Base):
    __tablename__ = "anomaly_alerts"
    id = Column(Integer, primary_key=True, index=True)
    severity = Column(Enum(AlertSeverity), default=AlertSeverity.LOW)
    message = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
