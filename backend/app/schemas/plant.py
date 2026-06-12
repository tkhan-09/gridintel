from __future__ import annotations
from typing import Optional
from uuid import UUID
from pydantic import BaseModel

class PlantCreate(BaseModel):
    name: str
    code: Optional[str] = None
    capacity_mw: float = 0.0
    fuel_type: Optional[str] = None
    technology: Optional[str] = None
    ownership: Optional[str] = None
    sector: Optional[str] = None
    grid_voltage: Optional[str] = None
    office_id: Optional[UUID] = None
    status: Optional[str] = "Active"

class PlantOut(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    capacity_mw: Optional[float] = None
    fuel_type: Optional[str] = None
    technology: Optional[str] = None
    ownership: Optional[str] = None
    sector: Optional[str] = None
    grid_voltage: Optional[str] = None
    office_id: Optional[int] = None
    status: Optional[str] = None

    class Config:
        from_attributes = True

class PlantUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    capacity_mw: Optional[float] = None
    fuel_type: Optional[str] = None
    technology: Optional[str] = None
    ownership: Optional[str] = None
    sector: Optional[str] = None
    grid_voltage: Optional[str] = None
    office_id: Optional[int] = None
    status: Optional[str] = None