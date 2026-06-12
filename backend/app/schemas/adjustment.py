from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class AdjustmentCreate(BaseModel):
    reason: Optional[str] = None
    amount: float = 0.0

class AdjustmentOut(BaseModel):
    id: int
    status: str
    reason: Optional[str] = None
    amount: float = 0.0
    class Config:
        from_attributes = True

class AdjustmentApproveRequest(BaseModel):
    notes: Optional[str] = None

class AdjustmentRejectRequest(BaseModel):
    reason: Optional[str] = None
