from __future__ import annotations
from typing import Optional, Any
from pydantic import BaseModel

class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    resource: Optional[str] = None
    details: Optional[Any] = None
    ip_address: Optional[str] = None
    class Config:
        from_attributes = True
