from __future__ import annotations
import enum
from sqlalchemy import Column, Integer, String, Float, Enum, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base

class AdjustmentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class Adjustment(Base):
    __tablename__ = "adjustments"
    id = Column(Integer, primary_key=True, index=True)
    status = Column(Enum(AdjustmentStatus), default=AdjustmentStatus.PENDING)
    reason = Column(Text, nullable=True)
    amount = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
