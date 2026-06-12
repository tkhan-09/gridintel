"""
GridIntel — Unified Pydantic v2 Schema Layer
All schemas for Auth, Entities, Operations, Billing & System
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


# ──────────────────────────────────────────────────────────────
# SHARED BASE
# ──────────────────────────────────────────────────────────────

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ──────────────────────────────────────────────────────────────
# ENUMS (mirrors DB / SQLAlchemy enums)
# ──────────────────────────────────────────────────────────────

class RoleEnum(str, Enum):
    super_admin   = "super_admin"
    admin         = "admin"
    engineer      = "engineer"
    operator      = "operator"
    viewer        = "viewer"


class FuelTypeEnum(str, Enum):
    natural_gas  = "Natural Gas"
    coal         = "Coal"
    furnace_oil  = "Furnace Oil"
    diesel       = "Diesel"
    hfo          = "HFO"
    hydro        = "Hydro"
    solar        = "Solar"


class VoltageEnum(str, Enum):
    kv400 = "400kV"
    kv230 = "230kV"
    kv132 = "132kV"
    kv33  = "33kV"
    kv11  = "11kV"


class OwnershipEnum(str, Enum):
    public  = "public"
    private = "private"


class SubmissionStatusEnum(str, Enum):
    draft     = "draft"
    submitted = "submitted"
    verified  = "verified"
    locked    = "locked"


class AnomalySeverityEnum(str, Enum):
    low      = "low"
    medium   = "medium"
    high     = "high"
    critical = "critical"


class NotificationTypeEnum(str, Enum):
    anomaly    = "anomaly"
    deadline   = "deadline"
    lock       = "lock"
    system     = "system"
    adjustment = "adjustment"


class CircuitDirectionEnum(str, Enum):
    import_   = "import"
    export    = "export"


# ──────────────────────────────────────────────────────────────
# AUTH SCHEMAS
# ──────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100, examples=["admin@bpdb.gov.bd"])
    password: str = Field(..., min_length=6, examples=["changeme123"])


class TokenResponse(OrmBase):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    expires_in:    int = Field(..., description="Access token TTL in seconds")
    user_id: int
    username: str
    role: RoleEnum
    office_id: Optional[int] = None
    office_name:   Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    token:        str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit.")
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter.")
        return v


class UserMeResponse(OrmBase):
    id:          uuid.UUID
    username:    str
    email:       EmailStr
    full_name:   Optional[str] = None
    role:        RoleEnum
    office_id:   Optional[uuid.UUID] = None
    office_name: Optional[str] = None
    is_active:   bool
    created_at:  datetime


# ──────────────────────────────────────────────────────────────
# ENTITY SCHEMAS — Plant
# ──────────────────────────────────────────────────────────────

class PlantCreate(BaseModel):
    name:              str           = Field(..., min_length=2, max_length=200)
    short_name:        Optional[str] = Field(None, max_length=50)
    installed_capacity: Decimal      = Field(..., gt=0, description="Installed capacity in MW")
    fuel_type:         FuelTypeEnum
    ownership:         OwnershipEnum = OwnershipEnum.public
    office_id:         uuid.UUID
    voltage_level:     VoltageEnum
    is_ccpp:           bool          = False
    commission_date:   Optional[date] = None
    omf_value:         Decimal        = Field(default=Decimal("0.00"), ge=0, le=100)
    cf_value:          Decimal        = Field(default=Decimal("0.00"), ge=0, le=100)
    remarks:           Optional[str]  = None


class PlantResponse(OrmBase):
    id:                uuid.UUID
    name:              str
    short_name:        Optional[str] = None
    installed_capacity: Decimal
    fuel_type:         FuelTypeEnum
    ownership:         OwnershipEnum
    office_id:         uuid.UUID
    office_name:       Optional[str] = None
    voltage_level:     VoltageEnum
    is_ccpp:           bool
    commission_date:   Optional[date] = None
    omf_value:         Decimal
    cf_value:          Decimal
    is_active:         bool
    created_at:        datetime
    updated_at:        Optional[datetime] = None


# ──────────────────────────────────────────────────────────────
# ENTITY SCHEMAS — Meter
# ──────────────────────────────────────────────────────────────

class MeterCreate(BaseModel):
    plant_id:       uuid.UUID
    meter_serial:   str       = Field(..., max_length=100)
    meter_type:     str       = Field(..., max_length=50, examples=["Main", "Check", "Auxiliary"])
    multiplier:     Decimal   = Field(default=Decimal("1.0"), gt=0)
    is_active:      bool      = True
    installed_date: Optional[date] = None
    remarks:        Optional[str]  = None


class MeterResponse(OrmBase):
    id:             uuid.UUID
    plant_id:       uuid.UUID
    plant_name:     Optional[str] = None
    meter_serial:   str
    meter_type:     str
    multiplier:     Decimal
    is_active:      bool
    installed_date: Optional[date] = None
    created_at:     datetime


# ──────────────────────────────────────────────────────────────
# ENTITY SCHEMAS — CrossBorder
# ──────────────────────────────────────────────────────────────

class CrossBorderCreate(BaseModel):
    circuit_name:      str              = Field(..., max_length=200)
    country_of_origin: str              = Field(..., max_length=100, examples=["India"])
    voltage_level:     VoltageEnum
    direction:         CircuitDirectionEnum = CircuitDirectionEnum.import_
    contracted_capacity: Optional[Decimal]  = Field(None, ge=0)
    is_active:         bool                = True
    remarks:           Optional[str]       = None


class CrossBorderResponse(OrmBase):
    id:                uuid.UUID
    circuit_name:      str
    country_of_origin: str
    voltage_level:     VoltageEnum
    direction:         CircuitDirectionEnum
    contracted_capacity: Optional[Decimal] = None
    is_active:         bool
    created_at:        datetime


# ──────────────────────────────────────────────────────────────
# ENTITY SCHEMAS — UtilitySales
# ──────────────────────────────────────────────────────────────

class UtilitySalesCreate(BaseModel):
    utility_company_id: uuid.UUID
    month:              int     = Field(..., ge=1, le=12)
    year:               int     = Field(..., ge=2000, le=2100)
    energy_sold_mu:     Decimal = Field(..., ge=0, description="MU (Million Units)")
    rate_per_unit:      Decimal = Field(..., ge=0)
    total_amount_bdt:   Optional[Decimal] = None
    remarks:            Optional[str]     = None

    @model_validator(mode="after")
    def compute_total(self) -> "UtilitySalesCreate":
        if self.total_amount_bdt is None and self.energy_sold_mu and self.rate_per_unit:
            self.total_amount_bdt = self.energy_sold_mu * self.rate_per_unit * Decimal("1000000")
        return self


class UtilitySalesResponse(OrmBase):
    id:                 uuid.UUID
    utility_company_id: uuid.UUID
    utility_name:       Optional[str] = None
    month:              int
    year:               int
    energy_sold_mu:     Decimal
    rate_per_unit:      Decimal
    total_amount_bdt:   Optional[Decimal] = None
    created_at:         datetime


# ──────────────────────────────────────────────────────────────
# OPERATIONS — MOD Reading
# ──────────────────────────────────────────────────────────────

class MODReadingEntry(BaseModel):
    plant_id:           uuid.UUID
    meter_id:           Optional[uuid.UUID] = None
    month:              int     = Field(..., ge=1, le=12)
    year:               int     = Field(..., ge=2000, le=2100)
    prev_reading_kwh:   Decimal = Field(..., ge=0)
    present_reading_kwh: Decimal = Field(..., ge=0)
    multiplier:         Decimal = Field(default=Decimal("1.0"), gt=0)
    gross_gen_kwh:      Optional[Decimal] = None
    station_use_kwh:    Optional[Decimal] = None
    net_gen_kwh:        Optional[Decimal] = None
    auxiliary_pct:      Optional[Decimal] = Field(None, ge=0, le=100)
    cf_value:           Optional[Decimal] = Field(None, ge=0, le=100)
    omf_value:          Optional[Decimal] = Field(None, ge=0, le=100)
    is_gt:              bool = False
    is_st:              bool = False
    remarks:            Optional[str] = None

    @model_validator(mode="after")
    def auto_calculate(self) -> "MODReadingEntry":
        diff = self.present_reading_kwh - self.prev_reading_kwh
        gross = diff * self.multiplier
        if self.gross_gen_kwh is None:
            self.gross_gen_kwh = gross
        if self.station_use_kwh is not None and self.net_gen_kwh is None:
            self.net_gen_kwh = self.gross_gen_kwh - self.station_use_kwh
        if self.gross_gen_kwh and self.station_use_kwh is not None:
            if self.auxiliary_pct is None and self.gross_gen_kwh > 0:
                self.auxiliary_pct = (self.station_use_kwh / self.gross_gen_kwh) * 100
        return self


class MODReadingBulkUpsert(BaseModel):
    entries:    list[MODReadingEntry] = Field(..., min_length=1, max_length=100)
    submitted_by: uuid.UUID
    office_id:  uuid.UUID

    @field_validator("entries")
    @classmethod
    def no_duplicate_plant_month(cls, entries: list[MODReadingEntry]) -> list[MODReadingEntry]:
        seen: set[tuple] = set()
        for e in entries:
            key = (str(e.plant_id), e.month, e.year)
            if key in seen:
                raise ValueError(f"Duplicate entry for plant {e.plant_id} month={e.month}/{e.year}")
            seen.add(key)
        return entries


class MODSubmissionResponse(OrmBase):
    id:            uuid.UUID
    office_id:     uuid.UUID
    office_name:   Optional[str] = None
    month:         int
    year:          int
    status:        SubmissionStatusEnum
    submitted_by:  Optional[uuid.UUID]   = None
    submitted_at:  Optional[datetime]    = None
    verified_by:   Optional[uuid.UUID]   = None
    verified_at:   Optional[datetime]    = None
    locked_at:     Optional[datetime]    = None
    record_count:  int = 0
    total_net_gen_mu: Optional[Decimal]  = None
    created_at:    datetime


class MonthLockRequest(BaseModel):
    month:      int     = Field(..., ge=1, le=12)
    year:       int     = Field(..., ge=2000, le=2100)
    office_id:  uuid.UUID
    lock_reason: Optional[str] = Field(None, max_length=500)

    @field_validator("year")
    @classmethod
    def reasonable_year(cls, v: int) -> int:
        import datetime as _dt
        current = _dt.datetime.utcnow().year
        if v > current:
            raise ValueError("Cannot lock a future year.")
        return v


# ──────────────────────────────────────────────────────────────
# BILLING & SYSTEM SCHEMAS
# ──────────────────────────────────────────────────────────────

class BillingRecordResponse(OrmBase):
    id:                  uuid.UUID
    utility_company_id:  uuid.UUID
    utility_name:        Optional[str] = None
    month:               int
    year:                int
    invoice_number:      str
    energy_billed_mu:    Decimal
    rate_per_unit:       Decimal
    gross_amount_bdt:    Decimal
    vat_amount_bdt:      Decimal
    net_amount_bdt:      Decimal
    payment_status:      str
    due_date:            Optional[date]     = None
    paid_date:           Optional[date]     = None
    paid_amount_bdt:     Optional[Decimal]  = None
    outstanding_bdt:     Optional[Decimal]  = None
    days_overdue:        Optional[int]      = None
    created_at:          datetime


class EnergyBalanceResponse(OrmBase):
    id:                  uuid.UUID
    month:               int
    year:                int
    office_id:           Optional[uuid.UUID] = None
    office_name:         Optional[str]       = None
    total_generation_mu: Decimal
    total_import_mu:     Decimal
    total_available_mu:  Decimal
    total_sales_mu:      Decimal
    total_loss_mu:       Decimal
    loss_pct:            Decimal
    auxiliary_mu:        Decimal
    auxiliary_pct:       Decimal
    net_gen_mu:          Decimal
    is_locked:           bool
    computed_at:         datetime


class AdjustmentCreate(BaseModel):
    target_table:   str       = Field(..., max_length=100, examples=["mod_readings"])
    target_id:      uuid.UUID
    field_name:     str       = Field(..., max_length=100)
    old_value:      Any
    new_value:      Any
    reason:         str       = Field(..., min_length=10, max_length=1000)
    supporting_doc: Optional[str] = Field(None, max_length=500, description="File path or URL")

    @field_validator("reason")
    @classmethod
    def reason_not_trivial(cls, v: str) -> str:
        if v.lower().strip() in {"n/a", "na", "none", "nil"}:
            raise ValueError("Adjustment reason must be substantive, not a placeholder.")
        return v


class AdjustmentResponse(OrmBase):
    id:             uuid.UUID
    target_table:   str
    target_id:      uuid.UUID
    field_name:     str
    old_value:      Any
    new_value:      Any
    reason:         str
    status:         str
    requested_by:   uuid.UUID
    requester_name: Optional[str] = None
    reviewed_by:    Optional[uuid.UUID] = None
    reviewer_name:  Optional[str]       = None
    reviewed_at:    Optional[datetime]  = None
    review_comment: Optional[str]       = None
    created_at:     datetime


class AnomalyAlertResponse(OrmBase):
    id:           uuid.UUID
    alert_type:   str
    severity:     AnomalySeverityEnum
    plant_id:     Optional[uuid.UUID] = None
    plant_name:   Optional[str]       = None
    office_id:    Optional[uuid.UUID] = None
    office_name:  Optional[str]       = None
    month:        Optional[int]       = None
    year:         Optional[int]       = None
    metric_name:  str
    metric_value: Optional[Decimal]   = None
    threshold:    Optional[Decimal]   = None
    description:  str
    is_resolved:  bool
    resolved_by:  Optional[uuid.UUID] = None
    resolved_at:  Optional[datetime]  = None
    created_at:   datetime


class NotificationResponse(OrmBase):
    id:            uuid.UUID
    user_id:       Optional[uuid.UUID]          = None
    office_id:     Optional[uuid.UUID]          = None
    type:          NotificationTypeEnum
    title:         str
    message:       str
    is_read:       bool
    metadata:      Optional[dict[str, Any]]     = None
    read_at:       Optional[datetime]           = None
    created_at:    datetime


class ForecastResponse(OrmBase):
    id:                   uuid.UUID
    plant_id:             Optional[uuid.UUID] = None
    plant_name:           Optional[str]       = None
    office_id:            Optional[uuid.UUID] = None
    forecast_month:       int
    forecast_year:        int
    predicted_gen_mu:     Decimal
    confidence_interval_low:  Optional[Decimal] = None
    confidence_interval_high: Optional[Decimal] = None
    model_used:           str
    mae:                  Optional[Decimal]   = None
    rmse:                 Optional[Decimal]   = None
    generated_at:         datetime


# ──────────────────────────────────────────────────────────────
# PAGINATION / LIST WRAPPERS
# ──────────────────────────────────────────────────────────────

class PaginatedResponse(OrmBase):
    total:   int
    page:    int
    size:    int
    pages:   int
    items:   list[Any]


class MessageResponse(BaseModel):
    message: str
    success: bool = True


# ──────────────────────────────────────────────────────────────
# ANALYTICS — Dashboard KPI / Company / Voltage
# ──────────────────────────────────────────────────────────────

class KPICard(BaseModel):
    label:       str
    value:       Decimal
    unit:        str
    delta_pct:   Optional[Decimal] = None
    delta_label: Optional[str]     = None
    trend:       Optional[str]     = Field(None, pattern="^(up|down|stable)$")


class MonthlyTrendPoint(BaseModel):
    month:          int
    year:           int
    generation_mu:  Decimal
    sales_mu:       Decimal
    loss_mu:        Decimal
    import_mu:      Decimal
    loss_pct:       Decimal


class TopPlantEntry(BaseModel):
    plant_id:      uuid.UUID
    plant_name:    str
    fuel_type:     FuelTypeEnum
    net_gen_mu:    Decimal
    capacity_mw:   Decimal
    plant_factor:  Decimal


class DashboardResponse(BaseModel):
    month:               int
    year:                int
    office_id:           Optional[uuid.UUID] = None
    kpi_cards:           list[KPICard]
    monthly_trends:      list[MonthlyTrendPoint]
    top_plants:          list[TopPlantEntry]
    generated_at:        datetime


class CompanySegmentEntry(BaseModel):
    company_name:    str
    ownership:       OwnershipEnum
    total_gen_mu:    Decimal
    net_gen_mu:      Decimal
    sales_mu:        Decimal
    loss_mu:         Decimal
    loss_pct:        Decimal
    mom_delta_pct:   Optional[Decimal] = None


class CompanyAnalyticsResponse(BaseModel):
    month:    int
    year:     int
    segments: list[CompanySegmentEntry]


class VoltageSegmentEntry(BaseModel):
    voltage_level:  VoltageEnum
    total_gen_mu:   Decimal
    import_mu:      Decimal
    available_mu:   Decimal
    sales_mu:       Decimal
    loss_mu:        Decimal
    loss_pct:       Decimal
    plant_count:    int


class VoltageAnalyticsResponse(BaseModel):
    month:    int
    year:     int
    segments: list[VoltageSegmentEntry]
