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
