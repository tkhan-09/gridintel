# audit_service.py
$auditService = @"
from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession

class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(self, **kwargs) -> None:
        pass

    async def get_logs(self, **kwargs):
        return []
"@
Set-Content -Path "E:\AI Projects\gridintel\backend\app\services\audit_service.py" -Value $auditService

# office.py model
$office = @"
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
Set-Content -Path "E:\AI Projects\gridintel\backend\app\models\office.py" -Value $office

# adjustment.py model
$adjustment = @"
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
Set-Content -Path "E:\AI Projects\gridintel\backend\app\models\adjustment.py" -Value $adjustment

# anomaly_alert.py model
$anomaly = @"
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
Set-Content -Path "E:\AI Projects\gridintel\backend\app\models\anomaly_alert.py" -Value $anomaly

# audit_log.py model
$auditLog = @"
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
Set-Content -Path "E:\AI Projects\gridintel\backend\app\models\audit_log.py" -Value $auditLog

Write-Host "All missing files created successfully!"
