from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class AnomalyAlertOut(BaseModel):
    id: int
    severity: str
    message: Optional[str] = None
    is_read: bool = False
    class Config:
        from_attributes = True

class AnomalyAlertUpdate(BaseModel):
    is_read: Optional[bool] = None
