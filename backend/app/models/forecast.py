from __future__ import annotations
from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime
from sqlalchemy.sql import func
from .base import Base

class Forecast(Base):
    __tablename__ = "forecasts"
    id = Column(Integer, primary_key=True, index=True)
    plant_id = Column(Integer, nullable=True)
    month = Column(Integer, nullable=True)
    year = Column(Integer, nullable=True)
    forecasted_generation = Column(Float, default=0.0)
    actual_generation = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
