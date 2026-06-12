$base = "E:\AI Projects\gridintel\backend\app"

# 1. notification_service.py
Set-Content -Path "$base\services\notification_service.py" -Value @"
from __future__ import annotations
from typing import Any, List
from sqlalchemy.ext.asyncio import AsyncSession

class NotificationService:
    def __init__(self, db: AsyncSession = None):
        self.db = db
        self._connections: List[Any] = []

    async def send(self, user_id: int, message: str, **kwargs) -> None:
        pass

    async def broadcast(self, message: str, **kwargs) -> None:
        pass

    async def get_notifications(self, user_id: int, **kwargs):
        return []

    def add_connection(self, websocket: Any) -> None:
        self._connections.append(websocket)

    def remove_connection(self, websocket: Any) -> None:
        self._connections.discard(websocket) if hasattr(self._connections, 'discard') else None
"@

# 2. audit_service.py (overwrite)
Set-Content -Path "$base\services\audit_service.py" -Value @"
from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession

class AuditService:
    def __init__(self, db: AsyncSession = None):
        self.db = db

    async def log(self, action: str, user_id: int = None, resource: str = None, details: dict = None, ip_address: str = None) -> None:
        pass

    async def get_logs(self, **kwargs):
        return []
"@

# 3. office.py model (overwrite)
Set-Content -Path "$base\models\office.py" -Value @"
from __future__ import annotations
from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base

class Office(Base):
    __tablename__ = "offices"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
"@

# 4. adjustment.py model (overwrite)
Set-Content -Path "$base\models\adjustment.py" -Value @"
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
"@

# 5. anomaly_alert.py model (overwrite)
Set-Content -Path "$base\models\anomaly_alert.py" -Value @"
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
"@

# 6. audit_log.py model (overwrite)
Set-Content -Path "$base\models\audit_log.py" -Value @"
from __future__ import annotations
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.core.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    action = Column(String(255), nullable=False)
    resource = Column(String(255), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
"@

# 7. database.py alias fix - add get_async_session alias
$dbContent = Get-Content -Path "$base\core\database.py" -Raw
if ($dbContent -notmatch "get_async_session") {
    Add-Content -Path "$base\core\database.py" -Value "`n`n# Alias`nget_async_session = get_db"
}

Write-Host "All files created/updated successfully!"
