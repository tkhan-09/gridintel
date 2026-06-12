# backend/app/api/v1/mod_and_operations.py
"""
GridIntel — MOD Workflow State Engine + Cross-Border + Utility Sales Routers
Covers:
  /mod        — readings, save-draft, submit, verify, lock
  /cross-border — CRUD for cross-border transmission connections
  /utility-sales — CRUD for bulk energy supply allocation
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, RoleChecker
from app.models.audit_log import AuditLog
from app.models.cross_border import CrossBorderCircuit, CrossBorderReading
from app.models.mod_reading import ModReading
from app.models.mod_submission import ModSubmission, SubmissionStatus
from app.models.month_lock import MonthLock
from app.models.plant import Plant
from app.models.user import User
from app.models.utility_sales import UtilitySalesAllocation
from app.schemas.cross_border import (
    CrossBorderCircuitCreate,
    CrossBorderCircuitOut,
    CrossBorderCircuitUpdate,
    CrossBorderReadingCreate,
    CrossBorderReadingOut,
    CrossBorderReadingUpdate,
)
from app.schemas.mod import (
    ModDraftBulkUpsert,
    ModReadingOut,
    ModSubmitRequest,
    ModVerifyRequest,
    ModLockRequest,
)
from app.schemas.utility_sales import (
    UtilitySalesAllocationCreate,
    UtilitySalesAllocationOut,
    UtilitySalesAllocationUpdate,
)
from app.services.audit_service import AuditService
from app.workers.recalculation_worker import enqueue_recalculation

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Role guards
# ─────────────────────────────────────────────────────────────────────────────
require_operator_or_above = RoleChecker(["operator", "auditor", "manager", "admin", "super_admin"])
require_auditor_or_above  = RoleChecker(["auditor", "manager", "admin", "super_admin"])
require_admin_or_above    = RoleChecker(["admin", "super_admin"])

# ─────────────────────────────────────────────────────────────────────────────
# /mod  router
# ─────────────────────────────────────────────────────────────────────────────
mod_router = APIRouter(prefix="/mod", tags=["MOD Workflow"])


@mod_router.get(
    "/readings",
    response_model=List[ModReadingOut],
    summary="Fetch MOD ledger rows for a given month/year (optionally filtered by office/plant)",
)
async def get_mod_readings(
    month: int = Query(..., ge=1, le=12, description="Calendar month (1–12)"),
    year:  int = Query(..., ge=2000,    description="Four-digit year"),
    office_id: Optional[UUID] = Query(None),
    plant_id:  Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
) -> List[ModReadingOut]:
    """
    Returns all MOD reading rows for the requested month/year.
    Applies optional filters by office or plant.
    Includes submission status so the UI can show per-row badges.
    """
    conditions = [ModReading.month == month, ModReading.year == year]

    if office_id:
        # Join through Plant to filter by office
        stmt = (
            select(ModReading)
            .join(Plant, Plant.id == ModReading.plant_id)
            .where(and_(*conditions, Plant.office_id == office_id))
            .order_by(Plant.name)
        )
    elif plant_id:
        conditions.append(ModReading.plant_id == plant_id)
        stmt = select(ModReading).where(and_(*conditions)).order_by(ModReading.created_at)
    else:
        stmt = (
            select(ModReading)
            .join(Plant, Plant.id == ModReading.plant_id)
            .where(and_(*conditions))
            .order_by(Plant.name)
        )

    result = await db.execute(stmt)
    readings = result.scalars().all()
    return [ModReadingOut.model_validate(r) for r in readings]


@mod_router.post(
    "/save-draft",
    status_code=status.HTTP_200_OK,
    summary="Bulk upsert MOD ledger rows as Draft (no state lock required)",
)
async def save_draft(
    payload: ModDraftBulkUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
    audit_svc: AuditService = Depends(AuditService),
) -> dict[str, Any]:
    """
    Performs a bulk upsert of MOD reading rows in DRAFT state.
    Does NOT acquire any row locks — any operator may overwrite until Submitted.
    Month must NOT be locked; if locked, raises 423 Locked.
    """
    await _assert_month_not_locked(payload.month, payload.year, db)

    upserted: list[UUID] = []
    for row in payload.rows:
        existing = await db.execute(
            select(ModReading).where(
                and_(
                    ModReading.plant_id == row.plant_id,
                    ModReading.month    == payload.month,
                    ModReading.year     == payload.year,
                    ModReading.reading_type == row.reading_type,
                )
            )
        )
        rec: Optional[ModReading] = existing.scalar_one_or_none()

        if rec:
            # Only allow draft-level edits; submitted rows require re-open
            if rec.status not in (SubmissionStatus.DRAFT, None):
                logger.warning(
                    "Skipping row %s — already in status %s", rec.id, rec.status
                )
                continue
            for field, val in row.model_dump(exclude_unset=True).items():
                setattr(rec, field, val)
            rec.updated_at   = datetime.utcnow()
            rec.updated_by   = current_user.id
        else:
            rec = ModReading(
                **row.model_dump(),
                month      = payload.month,
                year       = payload.year,
                status     = SubmissionStatus.DRAFT,
                created_by = current_user.id,
                updated_by = current_user.id,
            )
            db.add(rec)

        upserted.append(row.plant_id)

    await db.commit()

    await audit_svc.log(
        db         = db,
        user_id    = current_user.id,
        action     = "MOD_SAVE_DRAFT",
        module     = "mod",
        detail     = f"Bulk draft-saved {len(upserted)} rows for {payload.month}/{payload.year}",
        object_ids = [str(p) for p in upserted],
    )

    return {"saved": len(upserted), "month": payload.month, "year": payload.year}


@mod_router.post(
    "/submit",
    status_code=status.HTTP_200_OK,
    summary="Advance MOD rows from Draft → Submitted for a given plant/month",
)
async def submit_mod(
    payload: ModSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
    audit_svc: AuditService = Depends(AuditService),
) -> dict[str, Any]:
    """
    Transitions all DRAFT rows for the given plant + month/year to SUBMITTED.
    Creates or updates the ModSubmission tracker record.
    Raises 409 if rows are already Submitted/Verified/Locked.
    """
    await _assert_month_not_locked(payload.month, payload.year, db)

    rows_stmt = select(ModReading).where(
        and_(
            ModReading.plant_id == payload.plant_id,
            ModReading.month    == payload.month,
            ModReading.year     == payload.year,
        )
    )
    result = await db.execute(rows_stmt)
    rows: list[ModReading] = result.scalars().all()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No MOD rows found for this plant/month. Save a draft first.",
        )

    non_draft = [r for r in rows if r.status not in (SubmissionStatus.DRAFT, None)]
    if non_draft:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{len(non_draft)} row(s) already in {non_draft[0].status}; cannot re-submit.",
        )

    for row in rows:
        row.status     = SubmissionStatus.SUBMITTED
        row.updated_by = current_user.id
        row.updated_at = datetime.utcnow()

    # Upsert submission tracker
    sub_stmt = select(ModSubmission).where(
        and_(
            ModSubmission.plant_id == payload.plant_id,
            ModSubmission.month    == payload.month,
            ModSubmission.year     == payload.year,
        )
    )
    sub_result  = await db.execute(sub_stmt)
    submission: Optional[ModSubmission] = sub_result.scalar_one_or_none()
    if submission:
        submission.status       = SubmissionStatus.SUBMITTED
        submission.submitted_by = current_user.id
        submission.submitted_at = datetime.utcnow()
    else:
        submission = ModSubmission(
            plant_id     = payload.plant_id,
            month        = payload.month,
            year         = payload.year,
            status       = SubmissionStatus.SUBMITTED,
            submitted_by = current_user.id,
            submitted_at = datetime.utcnow(),
        )
        db.add(submission)

    await db.commit()

    await audit_svc.log(
        db      = db,
        user_id = current_user.id,
        action  = "MOD_SUBMIT",
        module  = "mod",
        detail  = (
            f"Plant {payload.plant_id} submitted MOD for "
            f"{payload.month}/{payload.year} ({len(rows)} rows)"
        ),
    )

    return {
        "submitted_rows": len(rows),
        "plant_id": str(payload.plant_id),
        "month": payload.month,
        "year": payload.year,
    }


@mod_router.post(
    "/verify",
    status_code=status.HTTP_200_OK,
    summary="Auditor/Admin: verify a plant's MOD submission (Submitted → Verified)",
    dependencies=[Depends(require_auditor_or_above)],
)
async def verify_mod(
    payload: ModVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> dict[str, Any]:
    """
    Advances all SUBMITTED rows for the given plant/month to VERIFIED.
    Requires Auditor or Admin role.
    Raises 422 if rows are not yet in SUBMITTED state.
    """
    await _assert_month_not_locked(payload.month, payload.year, db)

    rows_stmt = select(ModReading).where(
        and_(
            ModReading.plant_id == payload.plant_id,
            ModReading.month    == payload.month,
            ModReading.year     == payload.year,
        )
    )
    result = await db.execute(rows_stmt)
    rows: list[ModReading] = result.scalars().all()

    if not rows:
        raise HTTPException(status_code=404, detail="No MOD rows found for this plant/month.")

    not_submitted = [r for r in rows if r.status != SubmissionStatus.SUBMITTED]
    if not_submitted:
        raise HTTPException(
            status_code=422,
            detail=f"{len(not_submitted)} row(s) are not in SUBMITTED state. Verify cannot proceed.",
        )

    for row in rows:
        row.status     = SubmissionStatus.VERIFIED
        row.updated_by = current_user.id
        row.updated_at = datetime.utcnow()

    # Update tracker
    await db.execute(
        update(ModSubmission)
        .where(
            and_(
                ModSubmission.plant_id == payload.plant_id,
                ModSubmission.month    == payload.month,
                ModSubmission.year     == payload.year,
            )
        )
        .values(
            status      = SubmissionStatus.VERIFIED,
            verified_by = current_user.id,
            verified_at = datetime.utcnow(),
            remarks     = payload.remarks,
        )
    )

    await db.commit()

    await audit_svc.log(
        db      = db,
        user_id = current_user.id,
        action  = "MOD_VERIFY",
        module  = "mod",
        detail  = (
            f"Auditor verified Plant {payload.plant_id} for "
            f"{payload.month}/{payload.year}. Remarks: {payload.remarks}"
        ),
    )

    return {
        "verified_rows": len(rows),
        "plant_id": str(payload.plant_id),
        "month": payload.month,
        "year": payload.year,
    }


@mod_router.post(
    "/lock",
    status_code=status.HTTP_200_OK,
    summary="Admin: lock an entire month (freezes data + enqueues recalculation)",
    dependencies=[Depends(require_admin_or_above)],
)
async def lock_month(
    payload: ModLockRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> dict[str, Any]:
    """
    Locks the entire month for the given year.
    All MOD reading rows that are VERIFIED are transitioned to LOCKED.
    Any rows still in DRAFT/SUBMITTED are rejected from the lock with a warning list.
    After lock, a background recalculation job is enqueued via ARQ/Redis.
    Requires Admin or SuperAdmin role.
    """
    # Check if already locked
    lock_stmt = select(MonthLock).where(
        and_(MonthLock.month == payload.month, MonthLock.year == payload.year)
    )
    existing_lock = (await db.execute(lock_stmt)).scalar_one_or_none()
    if existing_lock and existing_lock.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Month {payload.month}/{payload.year} is already locked.",
        )

    # Gather all MOD rows for the month
    rows_stmt = select(ModReading).where(
        and_(ModReading.month == payload.month, ModReading.year == payload.year)
    )
    all_rows: list[ModReading] = (await db.execute(rows_stmt)).scalars().all()

    unlocked_warning: list[dict] = []
    locked_count = 0

    for row in all_rows:
        if row.status == SubmissionStatus.VERIFIED:
            row.status     = SubmissionStatus.LOCKED
            row.updated_by = current_user.id
            row.updated_at = datetime.utcnow()
            locked_count  += 1
        else:
            unlocked_warning.append(
                {"plant_id": str(row.plant_id), "status": row.status, "reading_type": row.reading_type}
            )

    # Create / update MonthLock record
    if existing_lock:
        existing_lock.is_locked  = True
        existing_lock.locked_by  = current_user.id
        existing_lock.locked_at  = datetime.utcnow()
        existing_lock.lock_note  = payload.lock_note
    else:
        db.add(
            MonthLock(
                month       = payload.month,
                year        = payload.year,
                is_locked   = True,
                locked_by   = current_user.id,
                locked_at   = datetime.utcnow(),
                lock_note   = payload.lock_note,
            )
        )

    await db.commit()

    # Dispatch background recalculation
    background_tasks.add_task(
        enqueue_recalculation,
        month=payload.month,
        year=payload.year,
        triggered_by=str(current_user.id),
    )

    await audit_svc.log(
        db      = db,
        user_id = current_user.id,
        action  = "MOD_LOCK_MONTH",
        module  = "mod",
        detail  = (
            f"Month {payload.month}/{payload.year} locked by Admin. "
            f"{locked_count} rows locked. {len(unlocked_warning)} rows skipped (not VERIFIED)."
        ),
    )

    return {
        "locked": True,
        "locked_rows": locked_count,
        "skipped_rows": unlocked_warning,
        "recalculation_enqueued": True,
        "month": payload.month,
        "year": payload.year,
    }


# ─────────────────────────────────────────────────────────────────────────────
# /cross-border router
# ─────────────────────────────────────────────────────────────────────────────
cross_border_router = APIRouter(prefix="/cross-border", tags=["Cross-Border Transmission"])


# --- Circuit CRUD ---

@cross_border_router.get(
    "/circuits",
    response_model=List[CrossBorderCircuitOut],
    summary="List all cross-border transmission circuits",
)
async def list_circuits(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_operator_or_above),
) -> List[CrossBorderCircuitOut]:
    result = await db.execute(select(CrossBorderCircuit).order_by(CrossBorderCircuit.name))
    return [CrossBorderCircuitOut.model_validate(c) for c in result.scalars().all()]


@cross_border_router.get(
    "/circuits/{circuit_id}",
    response_model=CrossBorderCircuitOut,
    summary="Retrieve a single cross-border circuit by ID",
)
async def get_circuit(
    circuit_id: UUID,
    db: AsyncSession   = Depends(get_db),
    _: User            = Depends(require_operator_or_above),
) -> CrossBorderCircuitOut:
    rec = await _get_or_404(db, CrossBorderCircuit, circuit_id)
    return CrossBorderCircuitOut.model_validate(rec)


@cross_border_router.post(
    "/circuits",
    response_model=CrossBorderCircuitOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new cross-border circuit definition",
    dependencies=[Depends(require_admin_or_above)],
)
async def create_circuit(
    payload: CrossBorderCircuitCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> CrossBorderCircuitOut:
    rec = CrossBorderCircuit(**payload.model_dump(), created_by=current_user.id)
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="CIRCUIT_CREATE",
        module="cross_border", detail=f"Created circuit: {rec.name}",
    )
    return CrossBorderCircuitOut.model_validate(rec)


@cross_border_router.put(
    "/circuits/{circuit_id}",
    response_model=CrossBorderCircuitOut,
    summary="Update cross-border circuit metadata",
    dependencies=[Depends(require_admin_or_above)],
)
async def update_circuit(
    circuit_id: UUID,
    payload: CrossBorderCircuitUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
) -> CrossBorderCircuitOut:
    rec = await _get_or_404(db, CrossBorderCircuit, circuit_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, val)
    rec.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="CIRCUIT_UPDATE",
        module="cross_border", detail=f"Updated circuit: {rec.name}",
    )
    return CrossBorderCircuitOut.model_validate(rec)


@cross_border_router.delete(
    "/circuits/{circuit_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a cross-border circuit definition",
    dependencies=[Depends(require_admin_or_above)],
)
async def delete_circuit(
    circuit_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
):
    rec = await _get_or_404(db, CrossBorderCircuit, circuit_id)
    await db.delete(rec)
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="CIRCUIT_DELETE",
        module="cross_border", detail=f"Deleted circuit id={circuit_id}",
    )


# --- Cross-Border Readings CRUD ---

@cross_border_router.get(
    "/readings",
    response_model=List[CrossBorderReadingOut],
    summary="List cross-border readings for a month/year",
)
async def list_cb_readings(
    month: int = Query(..., ge=1, le=12),
    year:  int = Query(..., ge=2000),
    circuit_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[CrossBorderReadingOut]:
    conditions = [CrossBorderReading.month == month, CrossBorderReading.year == year]
    if circuit_id:
        conditions.append(CrossBorderReading.circuit_id == circuit_id)
    result = await db.execute(
        select(CrossBorderReading)
        .where(and_(*conditions))
        .order_by(CrossBorderReading.reading_date)
    )
    return [CrossBorderReadingOut.model_validate(r) for r in result.scalars().all()]


@cross_border_router.post(
    "/readings",
    response_model=CrossBorderReadingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Record a new cross-border transmission reading",
)
async def create_cb_reading(
    payload: CrossBorderReadingCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
    audit_svc: AuditService = Depends(AuditService),
) -> CrossBorderReadingOut:
    await _assert_month_not_locked(payload.month, payload.year, db)
    rec = CrossBorderReading(**payload.model_dump(), created_by=current_user.id)
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="CB_READING_CREATE",
        module="cross_border",
        detail=f"Circuit {payload.circuit_id}: {payload.import_mwh} MWh import, {payload.export_mwh} MWh export",
    )
    return CrossBorderReadingOut.model_validate(rec)


@cross_border_router.put(
    "/readings/{reading_id}",
    response_model=CrossBorderReadingOut,
    summary="Update a cross-border reading",
)
async def update_cb_reading(
    reading_id: UUID,
    payload: CrossBorderReadingUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
    audit_svc: AuditService = Depends(AuditService),
) -> CrossBorderReadingOut:
    rec = await _get_or_404(db, CrossBorderReading, reading_id)
    await _assert_month_not_locked(rec.month, rec.year, db)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, val)
    rec.updated_at = datetime.utcnow()
    rec.updated_by = current_user.id
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="CB_READING_UPDATE",
        module="cross_border", detail=f"Updated reading id={reading_id}",
    )
    return CrossBorderReadingOut.model_validate(rec)


@cross_border_router.delete(
    "/readings/{reading_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a cross-border reading (pre-lock only)",
    dependencies=[Depends(require_auditor_or_above)],
)
async def delete_cb_reading(
    reading_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
):
    rec = await _get_or_404(db, CrossBorderReading, reading_id)
    await _assert_month_not_locked(rec.month, rec.year, db)
    await db.delete(rec)
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="CB_READING_DELETE",
        module="cross_border", detail=f"Deleted reading id={reading_id}",
    )


# ─────────────────────────────────────────────────────────────────────────────
# /utility-sales router
# ─────────────────────────────────────────────────────────────────────────────
utility_sales_router = APIRouter(prefix="/utility-sales", tags=["Utility Sales Allocation"])


@utility_sales_router.get(
    "/",
    response_model=List[UtilitySalesAllocationOut],
    summary="List utility sales allocations for a month/year",
)
async def list_utility_sales(
    month: int = Query(..., ge=1, le=12),
    year:  int = Query(..., ge=2000),
    utility_id: Optional[UUID] = Query(None, description="Filter by utility company ID"),
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> List[UtilitySalesAllocationOut]:
    conditions = [
        UtilitySalesAllocation.month == month,
        UtilitySalesAllocation.year  == year,
    ]
    if utility_id:
        conditions.append(UtilitySalesAllocation.utility_id == utility_id)
    result = await db.execute(
        select(UtilitySalesAllocation)
        .where(and_(*conditions))
        .order_by(UtilitySalesAllocation.utility_id)
    )
    return [UtilitySalesAllocationOut.model_validate(r) for r in result.scalars().all()]


@utility_sales_router.get(
    "/{allocation_id}",
    response_model=UtilitySalesAllocationOut,
    summary="Retrieve a single utility sales allocation record",
)
async def get_utility_sales(
    allocation_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User          = Depends(require_operator_or_above),
) -> UtilitySalesAllocationOut:
    rec = await _get_or_404(db, UtilitySalesAllocation, allocation_id)
    return UtilitySalesAllocationOut.model_validate(rec)


@utility_sales_router.post(
    "/",
    response_model=UtilitySalesAllocationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new utility sales allocation entry",
)
async def create_utility_sales(
    payload: UtilitySalesAllocationCreate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
    audit_svc: AuditService = Depends(AuditService),
) -> UtilitySalesAllocationOut:
    await _assert_month_not_locked(payload.month, payload.year, db)

    # Prevent duplicate entries for same utility/month/year
    dup_stmt = select(UtilitySalesAllocation).where(
        and_(
            UtilitySalesAllocation.utility_id == payload.utility_id,
            UtilitySalesAllocation.month      == payload.month,
            UtilitySalesAllocation.year       == payload.year,
        )
    )
    dup = (await db.execute(dup_stmt)).scalar_one_or_none()
    if dup:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An allocation for this utility/month/year already exists. Use PUT to update.",
        )

    rec = UtilitySalesAllocation(**payload.model_dump(), created_by=current_user.id)
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="UTILITY_SALES_CREATE",
        module="utility_sales",
        detail=f"Utility {payload.utility_id}: {payload.allocated_mwh} MWh for {payload.month}/{payload.year}",
    )
    return UtilitySalesAllocationOut.model_validate(rec)


@utility_sales_router.put(
    "/{allocation_id}",
    response_model=UtilitySalesAllocationOut,
    summary="Update a utility sales allocation",
)
async def update_utility_sales(
    allocation_id: UUID,
    payload: UtilitySalesAllocationUpdate,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
    audit_svc: AuditService = Depends(AuditService),
) -> UtilitySalesAllocationOut:
    rec = await _get_or_404(db, UtilitySalesAllocation, allocation_id)
    await _assert_month_not_locked(rec.month, rec.year, db)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, val)
    rec.updated_at = datetime.utcnow()
    rec.updated_by = current_user.id
    await db.commit()
    await db.refresh(rec)
    await audit_svc.log(
        db=db, user_id=current_user.id, action="UTILITY_SALES_UPDATE",
        module="utility_sales", detail=f"Updated allocation id={allocation_id}",
    )
    return UtilitySalesAllocationOut.model_validate(rec)


@utility_sales_router.delete(
    "/{allocation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a utility sales allocation (pre-lock only)",
    dependencies=[Depends(require_auditor_or_above)],
)
async def delete_utility_sales(
    allocation_id: UUID,
    db: AsyncSession   = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    audit_svc: AuditService = Depends(AuditService),
):
    rec = await _get_or_404(db, UtilitySalesAllocation, allocation_id)
    await _assert_month_not_locked(rec.month, rec.year, db)
    await db.delete(rec)
    await db.commit()
    await audit_svc.log(
        db=db, user_id=current_user.id, action="UTILITY_SALES_DELETE",
        module="utility_sales", detail=f"Deleted allocation id={allocation_id}",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _assert_month_not_locked(month: int, year: int, db: AsyncSession) -> None:
    """Raises HTTP 423 if the month/year is locked."""
    stmt = select(MonthLock).where(
        and_(MonthLock.month == month, MonthLock.year == year, MonthLock.is_locked.is_(True))
    )
    lock = (await db.execute(stmt)).scalar_one_or_none()
    if lock:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                f"Month {month}/{year} is locked. No direct edits allowed. "
                "Submit an adjustment request instead."
            ),
        )


async def _get_or_404(db: AsyncSession, model: Any, pk: UUID) -> Any:
    """Generic async get-by-PK with 404 guard."""
    result = await db.execute(select(model).where(model.id == pk))
    rec = result.scalar_one_or_none()
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{model.__name__} with id={pk} not found.",
        )
    return rec

from fastapi import APIRouter as _R
router = _R()
for r in [cross_border_router, mod_router, utility_sales_router]:
    router.include_router(r)
