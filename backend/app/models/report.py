from __future__ import annotations
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Enum, DateTime, Text
from sqlalchemy.sql import func
from .base import Base

class ReportStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, default="")
    status = Column(Enum(ReportStatus), default=ReportStatus.PENDING)
    file_url = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
