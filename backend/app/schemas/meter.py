from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class MeterCreate(BaseModel):
    plant_id: int
    meter_number: str
    meter_type: str
    multiplier: float = 1.0
    direction: str

class MeterOut(BaseModel):
    id: int
    plant_id: int
    meter_number: str
    meter_type: Optional[str] = None
    multiplier: Optional[float] = None
    direction: Optional[str] = None

    class Config:
        from_attributes = True

class MeterUpdate(BaseModel):
    meter_number: Optional[str] = None
    meter_type: Optional[str] = None
    multiplier: Optional[float] = None
    direction: Optional[str] = None