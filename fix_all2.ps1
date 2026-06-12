$m = "E:\AI Projects\gridintel\backend\app\models"
$s = "E:\AI Projects\gridintel\backend\app\schemas"
$svc = "E:\AI Projects\gridintel\backend\app\services"
$w = "E:\AI Projects\gridintel\backend\app\workers"

# forecast.py
Set-Content -Path "$m\forecast.py" -Value @'
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
'@

# notification.py
Set-Content -Path "$m\notification.py" -Value @'
from __future__ import annotations
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, Text
from sqlalchemy.sql import func
from .base import Base

class NotificationSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    title = Column(String(255), nullable=False, default="")
    message = Column(Text, nullable=True)
    severity = Column(Enum(NotificationSeverity), default=NotificationSeverity.INFO)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
'@

# report.py
Set-Content -Path "$m\report.py" -Value @'
from __future__ import annotations
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Enum, DateTime, Text
from sqlalchemy.sql import func
from .base import Base

class ReportStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, default="")
    status = Column(Enum(ReportStatus), default=ReportStatus.PENDING)
    file_url = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
'@

# schemas/adjustment.py
Set-Content -Path "$s\adjustment.py" -Value @'
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
'@

# schemas/anomaly.py
Set-Content -Path "$s\anomaly.py" -Value @'
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
'@

# schemas/audit.py
Set-Content -Path "$s\audit.py" -Value @'
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
'@

# schemas/billing.py
Set-Content -Path "$s\billing.py" -Value @'
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class BillingRecordCreate(BaseModel):
    entity_type: str
    entity_id: int
    month: int
    year: int
    rate_per_kwh: float = 0.0

class BillingRecordOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    month: int
    year: int
    gross_bill: float = 0.0
    net_bill: float = 0.0
    class Config:
        from_attributes = True

class BillingRecordUpdate(BaseModel):
    rate_per_kwh: Optional[float] = None

class FuelDeductionCreate(BaseModel):
    billing_id: int
    amount: float = 0.0
    description: Optional[str] = None

class FuelDeductionOut(BaseModel):
    id: int
    billing_id: Optional[int] = None
    amount: float = 0.0
    class Config:
        from_attributes = True

class FuelDeductionUpdate(BaseModel):
    amount: Optional[float] = None

class PenaltyDeductionCreate(BaseModel):
    billing_id: int
    amount: float = 0.0

class PenaltyDeductionOut(BaseModel):
    id: int
    amount: float = 0.0
    class Config:
        from_attributes = True

class InvoiceOut(BaseModel):
    id: int
    billing_id: Optional[int] = None
    status: str = "draft"
    class Config:
        from_attributes = True

class InvoiceUpdate(BaseModel):
    status: Optional[str] = None

class TariffCalculationRequest(BaseModel):
    entity_type: str
    entity_id: int
    month: int
    year: int

class TariffCalculationResult(BaseModel):
    gross_bill: float = 0.0
    net_bill: float = 0.0
    total_deductions: float = 0.0
'@

# schemas/plant.py
Set-Content -Path "$s\plant.py" -Value @'
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class PlantCreate(BaseModel):
    name: str
    code: Optional[str] = None
    capacity_mw: float = 0.0

class PlantOut(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class PlantUpdate(BaseModel):
    name: Optional[str] = None
    capacity_mw: Optional[float] = None
'@

# schemas/meter.py
Set-Content -Path "$s\meter.py" -Value @'
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class MeterCreate(BaseModel):
    plant_id: int
    meter_number: str

class MeterOut(BaseModel):
    id: int
    meter_number: str
    class Config:
        from_attributes = True

class MeterUpdate(BaseModel):
    meter_number: Optional[str] = None
'@

# schemas/user.py (if not exists)
$userSchemaPath = "$s\user.py"
if (-not (Test-Path $userSchemaPath)) {
    Set-Content -Path $userSchemaPath -Value @'
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "Viewer"

class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
'@
}

# services/billing_service.py
Set-Content -Path "$svc\billing_service.py" -Value @'
from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession

class BillingService:
    def __init__(self, db: AsyncSession = None):
        self.db = db

    async def calculate_tariff(self, **kwargs):
        return {"gross_bill": 0.0, "net_bill": 0.0, "total_deductions": 0.0}

    async def generate_invoice(self, **kwargs):
        return None
'@

# workers/recalculation_worker.py
Set-Content -Path "$w\recalculation_worker.py" -Value @'
from __future__ import annotations

async def enqueue_recalculation(adjustment_id: int, **kwargs) -> None:
    pass
'@

Write-Host "All files created successfully!"
