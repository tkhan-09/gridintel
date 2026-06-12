from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "Viewer"

from datetime import datetime
from typing import Optional

class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool = False
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
