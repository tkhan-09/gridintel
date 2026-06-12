# backend/app/api/v1/billing_and_system.py
"""
GridIntel — Billing, Adjustments, Notifications (WebSocket), and Admin System Routers
Covers:
  /billing        — tariff calculations, fuel/penalty deductions, invoice tracking
  /adjustments    — post-lock override approval + async recalculation
  /notifications  — full CRUD + /ws WebSocket real-time alert streaming
  /plants         — admin plant management
  /meters         — admin meter management
  /audit          — audit trail queries
  /reports        — report generation and retrieval
  /anomalies      — anomaly alert management
  /forecasts      — forecast data endpoints
  /users          — user management (Admin only)
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import and_, or_, select, update, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, RoleChecker
from app.models.adjustment import Adjustment, AdjustmentStatus
from app.models.anomaly_alert import AnomalyAlert, AlertSeverity
from app.models.audit_log import AuditLog
from app.models.billing import (
    BillingRecord,
    BillingStatus,
    FuelDeduction,
    PenaltyDeduction,
    Invoice,
)
from app.models.forecast import Forecast
from app.models.meter import Meter
from app.models.notification import Notification, NotificationSeverity
from app.models.plant import Plant
from app.models.report import Report, ReportStatus
from app.models.user import User
from app.schemas.adjustment import (
    AdjustmentApproveRequest,
    AdjustmentOut,
    AdjustmentCreate,
    AdjustmentRejectRequest,
)
from app.schemas.anomaly import AnomalyAlertOut, AnomalyAlertUpdate
from app.schemas.audit import AuditLogOut
from app.schemas.billing import (
    BillingRecordCreate,
    BillingRecordOut,
    BillingRecordUpdate,
    FuelDeductionCreate,
    FuelDeductionOut,
    FuelDeductionUpdate,
    InvoiceOut,
    InvoiceUpdate,
    PenaltyDeductionCreate,
    PenaltyDeductionOut,
    TariffCalculationRequest,
    TariffCalculationResult,
)
from app.schemas.plant import PlantCreate, PlantOut, PlantUpdate
from app.schemas.meter import MeterCreate, MeterOut, MeterUpdate
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.audit_service import AuditService
from app.services.billing_service import BillingService
from app.services.notification_service import NotificationService
from app.workers.recalculation_worker import enqueue_recalculation

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Role guards
# ─────────────────────────────────────────────────────────────────────────────
require_operator_or_above = RoleChecker(["operator", "auditor", "manager", "admin", "super_admin"])
require_auditor_or_above  = RoleChecker(["auditor", "manager", "admin", "super_admin"])
require_manager_or_above  = RoleChecker(["manager", "admin", "super_admin"])
require_admin_or_above    = RoleChecker(["Admin", "SuperAdmin", "admin", "super_admin"])


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket Connection Manager (in-process; swap for Redis pub/sub in prod)
# ─────────────────────────────────────────────────────────────────────────────
class _WebSocketConnectionManager:
    """Manages active WebSocket connections for the notifications channel."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active_connections.append(ws)
        logger.info("WS client connected. Total: %d", len(self.active_connections))

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active_connections:
            self.active_connections.remove(ws)
        logger.info("WS client disconnected. Total: %d", len(self.active_connections))

    async def broadcast(self, message: dict) -> None:
        """Broadcast a JSON-serialisable dict to all connected clients."""
        dead: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead.append(connection)
        for ws in dead:
            self.disconnect(ws)

    async def send_personal(self, message: dict, ws: WebSocket) -> None:
        try:
            await ws.send_json(message)
        except Exception:
            self.disconnect(ws)


ws_manager = _WebSocketConnectionManager()


# ─────────────────────────────────────────────────────────────────────────────
# /billing  router
# ─────────────────────────────────────────────────────────────────────────────
billing_router = APIRouter(prefix="/billing", tags=["Billing"])


@billing_router.get(
    "/",
    response_model=List[BillingRecordOut],
    summary="List billing records with optional filters",
)
async def list_billing_records(
    month: Optional[int]  = Query(None, ge=1, le=12),
    year:  Optional[int]  = Query(None, ge=2000),
    utility_id: Optional[UUID] = Query(None),
    billing_status: Optional[BillingStatus] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[BillingRecordOut]:
    conditions: list = []
    if month:
        conditions.append(BillingRecord.month == month)
    if year:
        conditions.append(BillingRecord.year == year)
    if utility_id:
        conditions.append(BillingRecord.utility_id == utility_id)
    if billing_status:
        conditions.append(BillingRecord.status == billing_status)

    stmt = (
        select(BillingRecord)
        .where(and_(*conditions) if conditions else True)
        .order_by(desc(BillingRecord.created_at))
    )
    result = await db.execute(stmt)
    return [BillingRecordOut.model_validate(r) for r in result.scalars().all()]


@billing_router.get(
    "/{billing_id}",
    response_model=BillingRecordOut,
    summary="Retrieve a single billing record",
)
async def get_billing_record(
    billing_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> BillingRecordOut:
    rec = await _get_or_404(db, BillingRecord, billing_id)
    return BillingRecordOut.model_validate(rec)


@billing_router.post(
    "/",
    response_model=BillingRecordOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new billing record",
    dependencies=[Depends(require_manager_or_above)],
)
async def create_billing_record(
    payload: BillingRecordCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> BillingRecordOut:
    rec = BillingRecord(**payload.model_dump(), created_by=current_user.id)
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="BILLING_CREATE",
        module="billing", detail=f"Created billing record id={rec.id}",
    )
    return BillingRecordOut.model_validate(rec)


@billing_router.put(
    "/{billing_id}",
    response_model=BillingRecordOut,
    summary="Update billing record fields (tariff, status, invoice URL)",
    dependencies=[Depends(require_manager_or_above)],
)
async def update_billing_record(
    billing_id: UUID,
    payload: BillingRecordUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> BillingRecordOut:
    rec = await _get_or_404(db, BillingRecord, billing_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, val)
    rec.updated_at = datetime.utcnow()
    rec.updated_by = current_user.id
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="BILLING_UPDATE",
        module="billing", detail=f"Updated billing record id={billing_id}",
    )
    return BillingRecordOut.model_validate(rec)


@billing_router.post(
    "/calculate-tariff",
    response_model=TariffCalculationResult,
    summary="Calculate final bill from generation, fuel deductions, and penalties",
)
async def calculate_tariff(
    payload: TariffCalculationRequest,
    billing_svc: BillingService = Depends(BillingService),
    _: User = Depends(require_operator_or_above),
) -> TariffCalculationResult:
    """
    Applies the tariff matrix:
      net_amount = (generation_mwh × tariff_rate_per_mwh)
                   - sum(fuel_deductions)
                   - sum(penalty_deductions)
    Returns line-item breakdown and final invoice amount.
    """
    return await billing_svc.calculate_tariff(payload)


# --- Fuel Deductions ---

@billing_router.get(
    "/{billing_id}/fuel-deductions",
    response_model=List[FuelDeductionOut],
    summary="List fuel deduction line items for a billing record",
)
async def list_fuel_deductions(
    billing_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[FuelDeductionOut]:
    result = await db.execute(
        select(FuelDeduction).where(FuelDeduction.billing_id == billing_id)
    )
    return [FuelDeductionOut.model_validate(r) for r in result.scalars().all()]


@billing_router.post(
    "/{billing_id}/fuel-deductions",
    response_model=FuelDeductionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a fuel deduction entry to a billing record",
    dependencies=[Depends(require_manager_or_above)],
)
async def create_fuel_deduction(
    billing_id: UUID,
    payload: FuelDeductionCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> FuelDeductionOut:
    await _get_or_404(db, BillingRecord, billing_id)
    rec = FuelDeduction(**payload.model_dump(), billing_id=billing_id, created_by=current_user.id)
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="FUEL_DEDUCTION_CREATE",
        module="billing", detail=f"Fuel deduction added to billing {billing_id}: {payload.amount} BDT",
    )
    return FuelDeductionOut.model_validate(rec)


@billing_router.put(
    "/fuel-deductions/{deduction_id}",
    response_model=FuelDeductionOut,
    summary="Update a fuel deduction entry",
    dependencies=[Depends(require_manager_or_above)],
)
async def update_fuel_deduction(
    deduction_id: UUID,
    payload: FuelDeductionUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> FuelDeductionOut:
    rec = await _get_or_404(db, FuelDeduction, deduction_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, val)
    rec.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="FUEL_DEDUCTION_UPDATE",
        module="billing", detail=f"Updated fuel deduction id={deduction_id}",
    )
    return FuelDeductionOut.model_validate(rec)


@billing_router.delete(
    "/fuel-deductions/{deduction_id}",
    status_code=status.HTTP_200_OK,
    summary="Remove a fuel deduction line item",
    dependencies=[Depends(require_admin_or_above)],
)
async def delete_fuel_deduction(
    deduction_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> None:
    rec = await _get_or_404(db, FuelDeduction, deduction_id)
    await db.delete(rec)
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="FUEL_DEDUCTION_DELETE",
        module="billing", detail=f"Deleted fuel deduction id={deduction_id}",
    )


# --- Penalty Deductions ---

@billing_router.post(
    "/{billing_id}/penalty-deductions",
    response_model=PenaltyDeductionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a penalty deduction to a billing record",
    dependencies=[Depends(require_manager_or_above)],
)
async def create_penalty_deduction(
    billing_id: UUID,
    payload: PenaltyDeductionCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> PenaltyDeductionOut:
    await _get_or_404(db, BillingRecord, billing_id)
    rec = PenaltyDeduction(**payload.model_dump(), billing_id=billing_id, created_by=current_user.id)
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="PENALTY_CREATE",
        module="billing", detail=f"Penalty added to billing {billing_id}: {payload.amount} BDT — {payload.reason}",
    )
    return PenaltyDeductionOut.model_validate(rec)


@billing_router.delete(
    "/penalty-deductions/{penalty_id}",
    status_code=status.HTTP_200_OK,
    summary="Remove a penalty deduction",
    dependencies=[Depends(require_admin_or_above)],
)
async def delete_penalty_deduction(
    penalty_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> None:
    rec = await _get_or_404(db, PenaltyDeduction, penalty_id)
    await db.delete(rec)
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="PENALTY_DELETE",
        module="billing", detail=f"Deleted penalty id={penalty_id}",
    )


# --- Invoice URL tracking ---

@billing_router.get(
    "/{billing_id}/invoice",
    response_model=InvoiceOut,
    summary="Get invoice metadata and download URL for a billing record",
)
async def get_invoice(
    billing_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> InvoiceOut:
    result = await db.execute(
        select(Invoice).where(Invoice.billing_id == billing_id)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No invoice found for billing_id={billing_id}.",
        )
    return InvoiceOut.model_validate(rec)


@billing_router.put(
    "/{billing_id}/invoice",
    response_model=InvoiceOut,
    summary="Update invoice URL or payment status for a billing record",
    dependencies=[Depends(require_manager_or_above)],
)
async def update_invoice(
    billing_id: UUID,
    payload: InvoiceUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> InvoiceOut:
    result = await db.execute(select(Invoice).where(Invoice.billing_id == billing_id))
    rec: Optional[Invoice] = result.scalar_one_or_none()

    if rec:
        for field, val in payload.model_dump(exclude_unset=True).items():
            setattr(rec, field, val)
        rec.updated_at = datetime.utcnow()
    else:
        rec = Invoice(**payload.model_dump(), billing_id=billing_id)
        db.add(rec)

    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="INVOICE_UPDATE",
        module="billing", detail=f"Invoice updated for billing {billing_id}",
    )
    return InvoiceOut.model_validate(rec)


# ─────────────────────────────────────────────────────────────────────────────
# /adjustments  router
# ─────────────────────────────────────────────────────────────────────────────
adjustments_router = APIRouter(prefix="/adjustments", tags=["Post-Lock Adjustments"])


@adjustments_router.get(
    "/",
    response_model=List[AdjustmentOut],
    summary="List all adjustment requests with optional status filter",
)
async def list_adjustments(
    adj_status: Optional[AdjustmentStatus] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year:  Optional[int] = Query(None, ge=2000),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_auditor_or_above),
) -> List[AdjustmentOut]:
    conditions: list = []
    if adj_status:
        conditions.append(Adjustment.status == adj_status)
    if month:
        conditions.append(Adjustment.month == month)
    if year:
        conditions.append(Adjustment.year == year)

    stmt = (
        select(Adjustment)
        .where(and_(*conditions) if conditions else True)
        .order_by(desc(Adjustment.created_at))
    )
    result = await db.execute(stmt)
    return [AdjustmentOut.model_validate(r) for r in result.scalars().all()]


@adjustments_router.get(
    "/{adjustment_id}",
    response_model=AdjustmentOut,
    summary="Get a single adjustment request",
)
async def get_adjustment(
    adjustment_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> AdjustmentOut:
    rec = await _get_or_404(db, Adjustment, adjustment_id)
    return AdjustmentOut.model_validate(rec)


@adjustments_router.post(
    "/",
    response_model=AdjustmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a post-lock data adjustment request",
)
async def create_adjustment(
    payload: AdjustmentCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
    audit_svc: AuditService = Depends(AuditService),
) -> AdjustmentOut:
    """
    Creates a new adjustment request for locked data.
    Operators submit; Admins approve.  Approved adjustments
    trigger a background recalculation via ARQ/Redis.
    """
    rec = Adjustment(
        **payload.model_dump(),
        status     = AdjustmentStatus.PENDING,
        created_by = current_user.id,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="ADJUSTMENT_SUBMIT",
        module="adjustments",
        detail=(
            f"Adjustment request submitted for plant {payload.plant_id} "
            f"{payload.month}/{payload.year}: {payload.field_name} → {payload.new_value}"
        ),
    )
    return AdjustmentOut.model_validate(rec)


@adjustments_router.post(
    "/approve",
    response_model=AdjustmentOut,
    status_code=status.HTTP_200_OK,
    summary="Admin: approve an adjustment, commit override, enqueue recalculation",
    dependencies=[Depends(require_admin_or_above)],
)
async def approve_adjustment(
    payload: AdjustmentApproveRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> AdjustmentOut:
    """
    1. Marks the Adjustment record as APPROVED.
    2. Applies the field override directly to the referenced ModReading row.
    3. Enqueues the async energy-balance recalculation worker via ARQ.
    Requires Admin or SuperAdmin.
    """
    rec = await _get_or_404(db, Adjustment, payload.adjustment_id)

    if rec.status != AdjustmentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Adjustment is already in {rec.status} state.",
        )

    # Dynamically apply the override to the target table/row
    from app.models.mod_reading import ModReading
    target_stmt = select(ModReading).where(
        and_(
            ModReading.plant_id == rec.plant_id,
            ModReading.month    == rec.month,
            ModReading.year     == rec.year,
            ModReading.reading_type == rec.reading_type,
        )
    )
    target_row: Optional[ModReading] = (await db.execute(target_stmt)).scalar_one_or_none()

    if target_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target MOD reading row not found. Cannot apply adjustment.",
        )

    # Validate that the field exists on the model before setting
    if not hasattr(target_row, rec.field_name):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Field '{rec.field_name}' does not exist on ModReading.",
        )

    # Capture old value for audit trail
    old_value = getattr(target_row, rec.field_name)
    setattr(target_row, rec.field_name, rec.new_value)
    target_row.updated_by = current_user.id
    target_row.updated_at = datetime.utcnow()

    # Approve the adjustment record
    rec.status      = AdjustmentStatus.APPROVED
    rec.approved_by = current_user.id
    rec.approved_at = datetime.utcnow()
    rec.admin_note  = payload.admin_note

    await db.commit()
    await db.refresh(rec)

    # Enqueue recalculation for the affected month
    background_tasks.add_task(
        enqueue_recalculation,
        month        = rec.month,
        year         = rec.year,
        triggered_by = str(current_user.id),
    )

    await audit_svc.log(
        db=db, user_id=current_user.id, action="ADJUSTMENT_APPROVE",
        module="adjustments",
        detail=(
            f"Adjustment {rec.id} approved: plant {rec.plant_id} "
            f"{rec.field_name}: {old_value} → {rec.new_value}. "
            f"Recalculation enqueued for {rec.month}/{rec.year}."
        ),
    )

    return AdjustmentOut.model_validate(rec)


@adjustments_router.post(
    "/{adjustment_id}/reject",
    response_model=AdjustmentOut,
    summary="Admin: reject an adjustment request",
    dependencies=[Depends(require_admin_or_above)],
)
async def reject_adjustment(
    adjustment_id: UUID,
    payload: AdjustmentRejectRequest,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> AdjustmentOut:
    rec = await _get_or_404(db, Adjustment, adjustment_id)
    if rec.status != AdjustmentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Adjustment is already in {rec.status} state.",
        )
    rec.status      = AdjustmentStatus.REJECTED
    rec.approved_by = current_user.id
    rec.approved_at = datetime.utcnow()
    rec.admin_note  = payload.rejection_reason
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="ADJUSTMENT_REJECT",
        module="adjustments",
        detail=f"Adjustment {adjustment_id} rejected. Reason: {payload.rejection_reason}",
    )
    return AdjustmentOut.model_validate(rec)


# ─────────────────────────────────────────────────────────────────────────────
# /notifications  router (REST + WebSocket)
# ─────────────────────────────────────────────────────────────────────────────
notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])

from fastapi import Response
@notifications_router.get("")
async def get_notifications_base(response: Response):
    response.status_code = 200
    return []


@notifications_router.get(
    "/",
    response_model=List[dict],
    summary="List notifications for the current user (newest first)",
)
async def list_notifications(
    unread_only: bool            = Query(False),
    limit:       int             = Query(50, ge=1, le=200),
    db:          AsyncSession    = Depends(get_db),
    current_user: User           = Depends(get_current_active_user),
) -> List[dict]:
    conditions = [
        or_(
            Notification.user_id == current_user.id,
            Notification.is_broadcast.is_(True),
        )
    ]
    if unread_only:
        conditions.append(Notification.is_read.is_(False))

    stmt = (
        select(Notification)
        .where(and_(*conditions))
        .order_by(desc(Notification.created_at))
        .limit(limit)
    )
    result  = await db.execute(stmt)
    records = result.scalars().all()
    return [
        {
            "id":          str(r.id),
            "title":       r.title,
            "body":        r.body,
            "severity":    r.severity,
            "is_read":     r.is_read,
            "module":      r.module,
            "created_at":  r.created_at.isoformat(),
        }
        for r in records
    ]


@notifications_router.get(
    "/unread-count",
    summary="Return count of unread notifications for the current user",
)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, int]:
    from sqlalchemy import func
    stmt = select(func.count()).where(
        and_(
            or_(
                Notification.user_id == current_user.id,
                Notification.is_broadcast.is_(True),
            ),
            Notification.is_read.is_(False),
        )
    )
    count: int = (await db.execute(stmt)).scalar_one()
    return {"unread_count": count}


@notifications_router.put(
    "/{notification_id}/read",
    status_code=status.HTTP_200_OK,
    summary="Mark a notification as read",
)
async def mark_notification_read(
    notification_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    rec = await _get_or_404(db, Notification, notification_id)
    # Ownership check: user can only mark their own or broadcast notifications
    if rec.user_id and rec.user_id != current_user.id and not rec.is_broadcast:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your notification.")
    rec.is_read   = True
    rec.read_at   = datetime.utcnow()
    await db.commit()
    return {"id": str(notification_id), "is_read": True}


@notifications_router.put(
    "/mark-all-read",
    status_code=status.HTTP_200_OK,
    summary="Mark all notifications as read for the current user",
)
async def mark_all_notifications_read(
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, int]:
    stmt = (
        update(Notification)
        .where(
            and_(
                or_(
                    Notification.user_id == current_user.id,
                    Notification.is_broadcast.is_(True),
                ),
                Notification.is_read.is_(False),
            )
        )
        .values(is_read=True, read_at=datetime.utcnow())
    )
    result = await db.execute(stmt)
    await db.commit()
    return {"marked_read": result.rowcount}


@notifications_router.delete(
    "/{notification_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a notification",
)
async def delete_notification(
    notification_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    rec = await _get_or_404(db, Notification, notification_id)
    if rec.user_id and rec.user_id != current_user.id:
        # Admins can delete any; others only their own
        if not any(r.name in ("admin", "super_admin") for r in current_user.roles):
            raise HTTPException(status_code=403, detail="Not your notification.")
    await db.delete(rec)
    await db.commit()


@notifications_router.post(
    "/broadcast",
    status_code=status.HTTP_201_CREATED,
    summary="Admin: broadcast a notification to all users + push via WebSocket",
    dependencies=[Depends(require_admin_or_above)],
)
async def broadcast_notification(
    title:    str = Query(..., max_length=200),
    body:     str = Query(..., max_length=1000),
    severity: NotificationSeverity = Query(NotificationSeverity.INFO),
    module:   Optional[str] = Query(None),
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    rec = Notification(
        user_id      = None,
        is_broadcast = True,
        title        = title,
        body         = body,
        severity     = severity,
        module       = module,
        created_by   = current_user.id,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)

    # Push to all connected WebSocket clients
    await ws_manager.broadcast(
        {
            "type":       "notification",
            "id":         str(rec.id),
            "title":      rec.title,
            "body":       rec.body,
            "severity":   rec.severity,
            "module":     rec.module,
            "created_at": rec.created_at.isoformat(),
        }
    )

    return {"id": str(rec.id), "broadcast": True, "ws_clients_notified": len(ws_manager.active_connections)}


@notifications_router.websocket("/ws")
async def notifications_websocket(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    WebSocket endpoint for real-time notification streaming.
    
    Connection flow:
    1. Client opens WS connection.
    2. Server sends unread notification count immediately on connect.
    3. Server broadcasts new notification JSON objects as they arrive.
    4. Client can send {"action": "mark_read", "id": "<uuid>"} to mark notifications.
    5. Client can send {"action": "ping"} — server replies with {"action": "pong"}.
    
    Messages from server are JSON with shape:
      { "type": "notification" | "unread_count" | "pong",
        "id", "title", "body", "severity", "module", "created_at" }
    """
    await ws_manager.connect(websocket)
    try:
        # Immediately send current unread count (no auth token in WS for simplicity;
        # production should validate token from query param or first message)
        from sqlalchemy import func
        count_stmt = select(func.count()).where(
            and_(Notification.is_broadcast.is_(True), Notification.is_read.is_(False))
        )
        unread: int = (await db.execute(count_stmt)).scalar_one()
        await ws_manager.send_personal({"type": "unread_count", "count": unread}, websocket)

        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Keepalive ping
                await ws_manager.send_personal({"type": "ping"}, websocket)
                continue

            try:
                msg: dict = json.loads(raw)
            except json.JSONDecodeError:
                await ws_manager.send_personal({"type": "error", "detail": "Invalid JSON"}, websocket)
                continue

            action = msg.get("action")

            if action == "ping":
                await ws_manager.send_personal({"type": "pong"}, websocket)

            elif action == "mark_read":
                nid = msg.get("id")
                if nid:
                    try:
                        nid_uuid = UUID(nid)
                        await db.execute(
                            update(Notification)
                            .where(Notification.id == nid_uuid)
                            .values(is_read=True, read_at=datetime.utcnow())
                        )
                        await db.commit()
                        await ws_manager.send_personal(
                            {"type": "marked_read", "id": nid}, websocket
                        )
                    except Exception as exc:
                        logger.warning("WS mark_read error: %s", exc)

            elif action == "subscribe":
                # Future: selective module subscription; no-op for now
                await ws_manager.send_personal({"type": "subscribed", "modules": "all"}, websocket)

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.error("WS error: %s", exc)
        ws_manager.disconnect(websocket)


# ─────────────────────────────────────────────────────────────────────────────
# /plants  — Admin plant management
# ─────────────────────────────────────────────────────────────────────────────
plants_admin_router = APIRouter(prefix="/plants", tags=["Admin: Plants"])


@plants_admin_router.get(
    "/",
    response_model=List[PlantOut],
    summary="List all power plants",
)
async def list_plants(
    office_id:  Optional[UUID] = Query(None),
    fuel_type:  Optional[str]  = Query(None),
    is_active:  Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[PlantOut]:
    conditions: list = []
    if office_id:
        conditions.append(Plant.office_id == office_id)
    if fuel_type:
        conditions.append(Plant.fuel_type == fuel_type)
    if is_active is not None:
        conditions.append(Plant.is_active == is_active)
    stmt = (
        select(Plant)
        .where(and_(*conditions) if conditions else True)
        .order_by(Plant.name)
    )
    result = await db.execute(stmt)
    return [PlantOut.model_validate(p) for p in result.scalars().all()]


@plants_admin_router.get("/{plant_id}", response_model=PlantOut)
async def get_plant(
    plant_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> PlantOut:
    return PlantOut.model_validate(await _get_or_404(db, Plant, plant_id))


@plants_admin_router.post(
    "/",
    response_model=PlantOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin_or_above)],
)
async def create_plant(
    payload: PlantCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> PlantOut:
    rec = Plant(**payload.model_dump(), created_by=current_user.id)
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="PLANT_CREATE",
        module="plants", detail=f"Created plant: {rec.name}",
    )
    return PlantOut.model_validate(rec)


@plants_admin_router.put(
    "/{plant_id}",
    response_model=PlantOut,
    dependencies=[Depends(require_admin_or_above)],
)
async def update_plant(
    plant_id: UUID,
    payload: PlantUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> PlantOut:
    rec = await _get_or_404(db, Plant, plant_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, val)
    rec.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="PLANT_UPDATE",
        module="plants", detail=f"Updated plant {plant_id}",
    )
    return PlantOut.model_validate(rec)


@plants_admin_router.delete(
    "/{plant_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_admin_or_above)],
)
async def delete_plant(
    plant_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> None:
    rec = await _get_or_404(db, Plant, plant_id)
    rec.is_active = False  # Soft-delete to preserve historical data integrity
    rec.updated_at = datetime.utcnow()
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="PLANT_DEACTIVATE",
        module="plants", detail=f"Soft-deleted (deactivated) plant {plant_id}",
    )


# ─────────────────────────────────────────────────────────────────────────────
# /meters  — Admin meter management
# ─────────────────────────────────────────────────────────────────────────────
meters_admin_router = APIRouter(prefix="/meters", tags=["Admin: Meters"])


@meters_admin_router.get("/", response_model=List[MeterOut])
async def list_meters(
    plant_id:  Optional[int] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[MeterOut]:
    conditions: list = []
    if plant_id:
        conditions.append(Meter.plant_id == plant_id)
    if is_active is not None:
        conditions.append(Meter.is_active == is_active)
    result = await db.execute(
        select(Meter)
        .where(and_(*conditions) if conditions else True)
        .order_by(Meter.meter_number)
    )
    return [MeterOut.model_validate(m) for m in result.scalars().all()]


@meters_admin_router.get("/{meter_id}", response_model=MeterOut)
async def get_meter(
    meter_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> MeterOut:
    return MeterOut.model_validate(await _get_or_404(db, Meter, meter_id))


@meters_admin_router.post(
    "/",
    response_model=MeterOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin_or_above)],
)
async def create_meter(
    payload: MeterCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> MeterOut:
    rec = Meter(**payload.model_dump(), created_by=current_user.id)
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="METER_CREATE",
        module="meters", detail=f"Created meter: {rec.meter_code} for plant {rec.plant_id}",
    )
    return MeterOut.model_validate(rec)


@meters_admin_router.put(
    "/{meter_id}",
    response_model=MeterOut,
    dependencies=[Depends(require_admin_or_above)],
)
async def update_meter(
    meter_id: UUID,
    payload: MeterUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> MeterOut:
    rec = await _get_or_404(db, Meter, meter_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, val)
    rec.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="METER_UPDATE",
        module="meters", detail=f"Updated meter {meter_id}",
    )
    return MeterOut.model_validate(rec)


@meters_admin_router.delete(
    "/{meter_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_admin_or_above)],
)
async def delete_meter(
    meter_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> None:
    rec = await _get_or_404(db, Meter, meter_id)
    rec.is_active  = False
    rec.updated_at = datetime.utcnow()
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="METER_DEACTIVATE",
        module="meters", detail=f"Deactivated meter {meter_id}",
    )


# ─────────────────────────────────────────────────────────────────────────────
# /audit  — Audit trail queries
# ─────────────────────────────────────────────────────────────────────────────
audit_router = APIRouter(prefix="/audit", tags=["Audit Trail"])


@audit_router.get(
    "/",
    response_model=List[AuditLogOut],
    summary="Query the audit trail with optional filters",
    dependencies=[Depends(require_auditor_or_above)],
)
async def list_audit_logs(
    module:    Optional[str]      = Query(None, description="Filter by module name"),
    user_id:   Optional[UUID]     = Query(None, description="Filter by actor user ID"),
    action:    Optional[str]      = Query(None, description="Filter by action code (partial match)"),
    date_from: Optional[datetime] = Query(None, description="ISO 8601 start timestamp"),
    date_to:   Optional[datetime] = Query(None, description="ISO 8601 end timestamp"),
    limit:     int                = Query(100, ge=1, le=1000),
    offset:    int                = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_auditor_or_above),
) -> List[AuditLogOut]:
    from sqlalchemy import ilike

    conditions: list = []
    if module:
        conditions.append(AuditLog.module == module)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if action:
        conditions.append(ilike(AuditLog.action, f"%{action}%"))
    if date_from:
        conditions.append(AuditLog.created_at >= date_from)
    if date_to:
        conditions.append(AuditLog.created_at <= date_to)

    stmt = (
        select(AuditLog)
        .where(and_(*conditions) if conditions else True)
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return [AuditLogOut.model_validate(r) for r in result.scalars().all()]


@audit_router.get(
    "/{log_id}",
    response_model=AuditLogOut,
    summary="Get a single audit log entry",
    dependencies=[Depends(require_auditor_or_above)],
)
async def get_audit_log(
    log_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_auditor_or_above),
) -> AuditLogOut:
    return AuditLogOut.model_validate(await _get_or_404(db, AuditLog, log_id))


# ─────────────────────────────────────────────────────────────────────────────
# /reports  — Report generation and retrieval
# ─────────────────────────────────────────────────────────────────────────────
reports_router = APIRouter(prefix="/reports", tags=["Reports"])


@reports_router.get(
    "/",
    response_model=List[dict],
    summary="List generated reports",
)
async def list_reports(
    report_type: Optional[str]        = Query(None),
    rep_status:  Optional[ReportStatus] = Query(None),
    month:       Optional[int]        = Query(None, ge=1, le=12),
    year:        Optional[int]        = Query(None, ge=2000),
    limit:       int                  = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[dict]:
    conditions: list = []
    if report_type:
        conditions.append(Report.report_type == report_type)
    if rep_status:
        conditions.append(Report.status == rep_status)
    if month:
        conditions.append(Report.month == month)
    if year:
        conditions.append(Report.year == year)

    result = await db.execute(
        select(Report)
        .where(and_(*conditions) if conditions else True)
        .order_by(desc(Report.created_at))
        .limit(limit)
    )
    records = result.scalars().all()
    return [
        {
            "id":          str(r.id),
            "report_type": r.report_type,
            "title":       r.title,
            "status":      r.status,
            "month":       r.month,
            "year":        r.year,
            "file_url":    r.file_url,
            "format":      r.format,
            "created_at":  r.created_at.isoformat(),
        }
        for r in records
    ]


@reports_router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue a report generation job (async via ARQ worker)",
)
async def generate_report(
    report_type: str          = Query(..., description="One of: MOD_SUMMARY, BILLING, ENERGY_BALANCE, ANOMALY, FORECAST, AUDIT, GENERATION_PLANT, GENERATION_FUEL, LOSS_ANALYSIS, UTILITY_SALES, CROSS_BORDER, SUBMISSION_STATUS"),
    month:       int          = Query(..., ge=1, le=12),
    year:        int          = Query(..., ge=2000),
    format:      str          = Query("PDF", description="PDF or EXCEL"),
    office_id:   Optional[UUID] = Query(None),
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
    audit_svc: AuditService = Depends(AuditService),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> dict[str, Any]:
    from app.workers.report_worker import enqueue_report_generation

    # Create a pending Report record so the frontend can poll for completion
    report = Report(
        report_type = report_type,
        title       = f"{report_type.replace('_', ' ').title()} — {month}/{year}",
        status      = ReportStatus.PENDING,
        month       = month,
        year        = year,
        format      = format.upper(),
        office_id   = office_id,
        requested_by = current_user.id,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    background_tasks.add_task(
        enqueue_report_generation,
        report_id    = str(report.id),
        report_type  = report_type,
        month        = month,
        year         = year,
        format       = format.upper(),
        office_id    = str(office_id) if office_id else None,
        requested_by = str(current_user.id),
    )

    await audit_svc.log(
        db=db, user_id=current_user.id, action="REPORT_REQUESTED",
        module="reports",
        detail=f"Report {report_type} ({format}) for {month}/{year} enqueued. Report ID: {report.id}",
    )

    return {
        "report_id":   str(report.id),
        "status":      ReportStatus.PENDING,
        "message":     "Report generation enqueued. Poll GET /reports/{id} for status.",
    }


@reports_router.get(
    "/{report_id}",
    summary="Get report status and download URL",
)
async def get_report(
    report_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> dict[str, Any]:
    rec = await _get_or_404(db, Report, report_id)
    return {
        "id":          str(rec.id),
        "report_type": rec.report_type,
        "title":       rec.title,
        "status":      rec.status,
        "month":       rec.month,
        "year":        rec.year,
        "file_url":    rec.file_url,
        "format":      rec.format,
        "error":       rec.error_message,
        "created_at":  rec.created_at.isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# /anomalies  — Anomaly alert management
# ─────────────────────────────────────────────────────────────────────────────
anomalies_router = APIRouter(prefix="/anomalies", tags=["Anomaly Alerts"])


@anomalies_router.get(
    "/",
    response_model=List[AnomalyAlertOut],
    summary="List anomaly alerts with optional filters",
)
async def list_anomalies(
    severity:    Optional[AlertSeverity] = Query(None),
    is_resolved: Optional[bool]          = Query(None),
    plant_id:    Optional[UUID]          = Query(None),
    month:       Optional[int]           = Query(None, ge=1, le=12),
    year:        Optional[int]           = Query(None, ge=2000),
    limit:       int                     = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[AnomalyAlertOut]:
    conditions: list = []
    if severity:
        conditions.append(AnomalyAlert.severity == severity)
    if is_resolved is not None:
        conditions.append(AnomalyAlert.is_resolved == is_resolved)
    if plant_id:
        conditions.append(AnomalyAlert.plant_id == plant_id)
    if month:
        conditions.append(AnomalyAlert.month == month)
    if year:
        conditions.append(AnomalyAlert.year == year)

    result = await db.execute(
        select(AnomalyAlert)
        .where(and_(*conditions) if conditions else True)
        .order_by(desc(AnomalyAlert.detected_at))
        .limit(limit)
    )
    return [AnomalyAlertOut.model_validate(r) for r in result.scalars().all()]


@anomalies_router.get(
    "/{anomaly_id}",
    response_model=AnomalyAlertOut,
    summary="Retrieve a single anomaly alert",
)
async def get_anomaly(
    anomaly_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> AnomalyAlertOut:
    return AnomalyAlertOut.model_validate(await _get_or_404(db, AnomalyAlert, anomaly_id))


@anomalies_router.put(
    "/{anomaly_id}/resolve",
    response_model=AnomalyAlertOut,
    summary="Mark an anomaly alert as resolved",
    dependencies=[Depends(require_auditor_or_above)],
)
async def resolve_anomaly(
    anomaly_id: UUID,
    resolution_note: str = Query(..., max_length=500),
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> AnomalyAlertOut:
    rec = await _get_or_404(db, AnomalyAlert, anomaly_id)
    if rec.is_resolved:
        raise HTTPException(status_code=409, detail="Anomaly is already resolved.")
    rec.is_resolved     = True
    rec.resolved_by     = current_user.id
    rec.resolved_at     = datetime.utcnow()
    rec.resolution_note = resolution_note
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="ANOMALY_RESOLVE",
        module="anomalies", detail=f"Resolved anomaly {anomaly_id}: {resolution_note}",
    )
    return AnomalyAlertOut.model_validate(rec)


@anomalies_router.put(
    "/{anomaly_id}",
    response_model=AnomalyAlertOut,
    summary="Update anomaly alert metadata",
    dependencies=[Depends(require_auditor_or_above)],
)
async def update_anomaly(
    anomaly_id: UUID,
    payload: AnomalyAlertUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> AnomalyAlertOut:
    rec = await _get_or_404(db, AnomalyAlert, anomaly_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, val)
    await db.commit()
    await db.refresh(rec)
    return AnomalyAlertOut.model_validate(rec)


# ─────────────────────────────────────────────────────────────────────────────
# /forecasts  — Forecast data endpoints
# ─────────────────────────────────────────────────────────────────────────────
forecasts_router = APIRouter(prefix="/forecasts", tags=["Forecasts"])


@forecasts_router.get(
    "/",
    summary="List forecast records",
)
async def list_forecasts(
    plant_id: Optional[UUID] = Query(None),
    month:    Optional[int]  = Query(None, ge=1, le=12),
    year:     Optional[int]  = Query(None, ge=2000),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[dict]:
    conditions: list = []
    if plant_id:
        conditions.append(Forecast.plant_id == plant_id)
    if month:
        conditions.append(Forecast.forecast_month == month)
    if year:
        conditions.append(Forecast.forecast_year == year)

    result = await db.execute(
        select(Forecast)
        .where(and_(*conditions) if conditions else True)
        .order_by(desc(Forecast.generated_at))
    )
    records = result.scalars().all()
    return [
        {
            "id":               str(r.id),
            "plant_id":         str(r.plant_id),
            "forecast_month":   r.forecast_month,
            "forecast_year":    r.forecast_year,
            "predicted_gen_mu": float(r.predicted_gen_mu),
            "confidence":       float(r.confidence) if r.confidence else None,
            "model_version":    r.model_version,
            "generated_at":     r.generated_at.isoformat(),
        }
        for r in records
    ]


@forecasts_router.get(
    "/{forecast_id}",
    summary="Get a single forecast record",
)
async def get_forecast(
    forecast_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> dict:
    rec = await _get_or_404(db, Forecast, forecast_id)
    return {
        "id":               str(rec.id),
        "plant_id":         str(rec.plant_id),
        "forecast_month":   rec.forecast_month,
        "forecast_year":    rec.forecast_year,
        "predicted_gen_mu": float(rec.predicted_gen_mu),
        "confidence":       float(rec.confidence) if rec.confidence else None,
        "model_version":    rec.model_version,
        "generated_at":     rec.generated_at.isoformat(),
        "input_features":   rec.input_features,
    }


@forecasts_router.post(
    "/trigger",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Admin: manually trigger forecast recalculation for a month",
    dependencies=[Depends(require_admin_or_above)],
)
async def trigger_forecast(
    month: int = Query(..., ge=1, le=12),
    year:  int = Query(..., ge=2000),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    from app.workers.forecast_worker import enqueue_forecast

    background_tasks.add_task(
        enqueue_forecast,
        month        = month,
        year         = year,
        triggered_by = str(current_user.id),
    )
    await audit_svc.log(
        db=db, user_id=current_user.id, action="FORECAST_TRIGGER",
        module="forecasts", detail=f"Forecast triggered for {month}/{year}",
    )
    return {"status": "enqueued", "month": month, "year": year}


# ─────────────────────────────────────────────────────────────────────────────
# /users  — User management (Admin only)
# ─────────────────────────────────────────────────────────────────────────────
users_admin_router = APIRouter(
    prefix="/users",
    tags=["Admin: Users"],
    dependencies=[Depends(require_admin_or_above)],
)


@users_admin_router.get(
    "/",
    response_model=List[UserOut],
    summary="List all system users",
)
async def list_users(
    is_active: Optional[bool] = Query(None),
    office_id: Optional[UUID] = Query(None),
    role_name: Optional[str]  = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_admin_or_above),
) -> List[UserOut]:
    from sqlalchemy.orm import selectinload
    from app.models.role import Role

    stmt = select(User)
    conditions: list = []
    if is_active is not None:
        conditions.append(User.is_active == is_active)
    if office_id:
        conditions.append(User.office_id == office_id)
    if conditions:
        stmt = stmt.where(and_(*conditions))

    result = await db.execute(stmt.order_by(User.username))
    users  = result.scalars().all()

    if role_name:
        users = [u for u in users if u.role == role_name]

    return [UserOut(id=u.id, username=u.username, email=u.email, role=u.role.name, is_active=u.is_active, created_at=u.created_at) for u in users]


@users_admin_router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_admin_or_above),
) -> UserOut:
    return UserOut.model_validate(await _get_or_404(db, User, user_id))


@users_admin_router.post(
    "/",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user account",
)
async def create_user(
    payload: UserCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> UserOut:
    from app.core.security import hash_password
    from app.models.role import Role

    # Check username uniqueness
    dup = (
        await db.execute(select(User).where(User.username == payload.username))
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail=f"Username '{payload.username}' already exists.")

    role = (
        await db.execute(select(Role).where(Role.name == payload.role))
    ).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=422, detail=f"Role '{payload.role}' not found.")

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_active=True,
    )
    user.role_id = role.id
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await audit_svc.log(
        db=db, user_id=current_user.id, action="USER_CREATE",
        module="users", detail=f"Created user '{user.username}' with roles {payload.roles}",
    )
    return UserOut.model_validate(user)


@users_admin_router.put(
    "/{user_id}",
    response_model=UserOut,
    summary="Update user profile and role assignments",
)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> UserOut:
    from app.models.role import Role

    rec = await _get_or_404(db, User, user_id)

    for field, val in payload.model_dump(exclude_unset=True, exclude={"roles", "password"}).items():
        setattr(rec, field, val)

    if payload.password:
        from app.core.security import hash_password
        rec.password_hash = hash_password(payload.password)

    if payload.roles is not None:
        new_roles = []
        for role_name in payload.roles:
            role = (
                await db.execute(select(Role).where(Role.name == role_name))
            ).scalar_one_or_none()
            if not role:
                raise HTTPException(status_code=422, detail=f"Role '{role_name}' not found.")
            new_roles.append(role)
        rec.roles = new_roles

    rec.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="USER_UPDATE",
        module="users", detail=f"Updated user {user_id}",
    )
    return UserOut.model_validate(rec)


@users_admin_router.delete(
    "/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Deactivate (soft-delete) a user account",
)
async def deactivate_user(
    user_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> None:
    rec = await _get_or_404(db, User, user_id)
    if rec.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account.")
    rec.is_active  = False
    rec.updated_at = datetime.utcnow()
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="USER_DEACTIVATE",
        module="users", detail=f"Deactivated user {user_id}",
    )


@users_admin_router.post(
    "/{user_id}/activate",
    status_code=status.HTTP_200_OK,
    summary="Re-activate a deactivated user account",
)
async def activate_user(
    user_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> dict[str, Any]:
    rec = await _get_or_404(db, User, user_id)
    rec.is_active  = True
    rec.updated_at = datetime.utcnow()
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="USER_ACTIVATE",
        module="users", detail=f"Activated user {user_id}",
    )
    return {"id": str(user_id), "is_active": True}


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, model: Any, pk: UUID) -> Any:
    result = await db.execute(select(model).where(model.id == pk))
    rec    = result.scalar_one_or_none()
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{model.__name__} with id={pk} not found.",
        )
    return rec



from fastapi import APIRouter as _R
router = _R()
for r in [adjustments_router, anomalies_router, audit_router, billing_router, forecasts_router, meters_admin_router, notifications_router, plants_admin_router, reports_router, users_admin_router]:
    router.include_router(r)
