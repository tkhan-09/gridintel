"""
GridIntel — Auth + Analytics Router (Combined Hyper-Optimised File)
Routers: /api/v1/auth  |  /api/v1/analytics
JWT RBAC enforced on every protected endpoint.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.dependencies import (
    get_current_active_user,
    require_role,
    RoleChecker,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.schemas import (
    # Auth
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    ForgotPasswordRequest,
    PasswordResetRequest,
    UserMeResponse,
    MessageResponse,
    RoleEnum,
    # Analytics
    DashboardResponse,
    KPICard,
    MonthlyTrendPoint,
    TopPlantEntry,
    CompanyAnalyticsResponse,
    CompanySegmentEntry,
    VoltageAnalyticsResponse,
    VoltageSegmentEntry,
    OwnershipEnum,
    VoltageEnum,
    FuelTypeEnum,
)
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService

# ──────────────────────────────────────────────────────────────
# ROUTER SETUP
# ──────────────────────────────────────────────────────────────

auth_router      = APIRouter(prefix="/auth",      tags=["Authentication"])
analytics_router = APIRouter(prefix="/analytics", tags=["Analytics"])

# Dependency aliases
Session  = Annotated[AsyncSession, Depends(get_async_session)]
AuthUser = Annotated[User, Depends(get_current_active_user)]
AdminOrAbove = Depends(RoleChecker([RoleEnum.admin, RoleEnum.super_admin]))


# ══════════════════════════════════════════════════════════════
#  AUTH ROUTER
# ══════════════════════════════════════════════════════════════

@auth_router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Obtain JWT access + refresh tokens",
)
async def login(
    payload:  LoginRequest,
    db:       Session,
    bg_tasks: BackgroundTasks,
) -> TokenResponse:
    """
    Authenticate with username/email + password.
    Returns a short-lived access token and a long-lived refresh token.
    """
    # Fetch user by username or email
    result = await db.execute(
        text(
            "SELECT u.id, u.username, u.email, u.hashed_password, r.name as role, "
            "       u.office_id, u.is_active "
            "FROM users u JOIN roles r ON u.role_id = r.id "
            "WHERE (u.username = :ident OR u.email = :ident) "
            "LIMIT 1"
        ),
        {"ident": payload.username},
    )
    row = result.mappings().first()

    if not row or not verify_password(payload.password, row["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact your administrator.",
        )

    user_id   = row["id"]
    role      = row["role"]
    office_id = row["office_id"]

    access_token  = create_access_token(subject=str(user_id), role=role)
    refresh_token = create_refresh_token(subject=str(user_id))

    # Fetch office name if present
    office_name: Optional[str] = None
    if office_id:
        o = await db.execute(
            text("SELECT name FROM offices WHERE id = :oid LIMIT 1"),
            {"oid": office_id},
        )
        o_row = o.mappings().first()
        if o_row:
            office_name = o_row["name"]

    # Audit log (fire-and-forget)
    bg_tasks.add_task(
        AuditService.log,
        db=db,
        user_id=str(user_id),
        action="login",
        resource="auth",
        resource_id=str(user_id),
        detail={"ip": "n/a"},
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=3600,
        user_id=str(user_id), 
        username=row["username"],
        role=RoleEnum(role),
        office_id=str(office_id) if office_id else None,
        office_name=office_name,
    )


@auth_router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate tokens using a valid refresh token",
)
async def refresh_tokens(
    payload: RefreshRequest,
    db:      Session,
) -> TokenResponse:
    """Exchange a valid refresh token for a new access + refresh token pair."""
    token_data = decode_refresh_token(payload.refresh_token)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user_id = token_data.get("sub")
    result  = await db.execute(
        text(
            "SELECT id, username, email, role, office_id, is_active "
            "FROM users WHERE id = :uid LIMIT 1"
        ),
        {"uid": user_id},
    )
    row = result.mappings().first()

    if not row or not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.",
        )

    office_name: Optional[str] = None
    if row["office_id"]:
        o = await db.execute(
            text("SELECT name FROM offices WHERE id = :oid LIMIT 1"),
            {"oid": row["office_id"]},
        )
        o_row = o.mappings().first()
        if o_row:
            office_name = o_row["name"]

    return TokenResponse(
        access_token=create_access_token(subject=str(row["id"]), role=row["role"]),
        refresh_token=create_refresh_token(subject=str(row["id"])),
        expires_in=3600,
        user_id=row["id"],
        username=row["username"],
        role=RoleEnum(row["role"]),
        office_id=row["office_id"],
        office_name=office_name,
    )


@auth_router.get(
    "/me",
    response_model=UserMeResponse,
    status_code=status.HTTP_200_OK,
    summary="Fetch current authenticated user metadata",
)
async def get_me(
    current_user: AuthUser,
    db:           Session,
) -> UserMeResponse:
    """Returns the profile of the currently authenticated user."""
    office_name: Optional[str] = None
    if current_user.office_id:
        o = await db.execute(
            text("SELECT name FROM offices WHERE id = :oid LIMIT 1"),
            {"oid": current_user.office_id},
        )
        o_row = o.mappings().first()
        if o_row:
            office_name = o_row["name"]

    return UserMeResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=getattr(current_user, "full_name", None),
        role=RoleEnum(current_user.role),
        office_id=current_user.office_id,
        office_name=office_name,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
    )


@auth_router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Initiate password reset flow",
)
async def forgot_password(
    payload:  ForgotPasswordRequest,
    db:       Session,
    bg_tasks: BackgroundTasks,
) -> MessageResponse:
    """
    Generates a password reset token and (in production) sends an email.
    Always returns HTTP 200 to prevent user enumeration.
    """
    result = await db.execute(
        text("SELECT id, email FROM users WHERE email = :email LIMIT 1"),
        {"email": payload.email},
    )
    row = result.mappings().first()

    if row:
        reset_token = create_password_reset_token(email=str(row["email"]))
        # TODO: integrate with email service
        # bg_tasks.add_task(send_reset_email, email=row["email"], token=reset_token)

        # Store token hash + expiry in DB
        await db.execute(
            text(
                "UPDATE users "
                "SET password_reset_token = :token, "
                "    password_reset_expires = :exp "
                "WHERE id = :uid"
            ),
            {
                "token": reset_token,
                "exp":   datetime.now(tz=timezone.utc) + timedelta(hours=1),
                "uid":   row["id"],
            },
        )
        await db.commit()

    return MessageResponse(
        message="If the email exists, a password reset link has been sent.",
        success=True,
    )


@auth_router.post(
    "/reset-password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Complete password reset using token",
)
async def reset_password(
    payload: PasswordResetRequest,
    db:      Session,
) -> MessageResponse:
    """Validates the reset token and sets a new password."""
    result = await db.execute(
        text(
            "SELECT id, password_reset_token, password_reset_expires "
            "FROM users "
            "WHERE password_reset_token = :token "
            "LIMIT 1"
        ),
        {"token": payload.token},
    )
    row = result.mappings().first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    expires: Optional[datetime] = row["password_reset_expires"]
    if expires and expires.replace(tzinfo=timezone.utc) < datetime.now(tz=timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new one.",
        )

    new_hash = hash_password(payload.new_password)
    await db.execute(
        text(
            "UPDATE users "
            "SET hashed_password = :pwd, "
            "    password_reset_token = NULL, "
            "    password_reset_expires = NULL "
            "WHERE id = :uid"
        ),
        {"pwd": new_hash, "uid": row["id"]},
    )
    await db.commit()

    return MessageResponse(message="Password updated successfully.", success=True)


# ══════════════════════════════════════════════════════════════
#  ANALYTICS ROUTER
# ══════════════════════════════════════════════════════════════

# ── DASHBOARD ─────────────────────────────────────────────────

@analytics_router.get(
    "/dashboard",
    response_model=DashboardResponse,
    status_code=status.HTTP_200_OK,
    summary="Single-call dashboard: 6 KPIs + 12-month trend + top-5 plants",
)
async def get_dashboard(
    current_user: AuthUser,
    db:           Session,
    month: int        = Query(..., ge=1, le=12, description="Reporting month"),
    year:  int        = Query(..., ge=2000, le=2100, description="Reporting year"),
    office_id: Optional[uuid.UUID] = Query(None, description="Filter by office UUID"),
) -> DashboardResponse:
    """
    Executes a single optimised async raw SQL batch that returns:
    - 6 KPI card values (generation, import, available, sales, loss, auxiliary)
    - 12-month rolling energy balance trend
    - Top 5 power plants by net generation

    All three datasets returned in one round-trip to avoid N+1 page-load latency.
    """
    office_filter      = "AND eb.id = :oid" if office_id else ""
    plant_office_filter = "AND p.office_id = :oid" if office_id else ""
    bind_params: dict  = {"month": month, "year": year}
    if office_id:
        bind_params["oid"] = office_id

    # ── KPI QUERY ──────────────────────────────────────────────
    kpi_sql = text(f"""
        SELECT
            COALESCE(SUM(eb.total_generation_kwh), 0)   AS total_gen,
            COALESCE(SUM(eb.total_import_kwh), 0)       AS total_import,
            COALESCE(SUM(eb.total_available_energy_kwh), 0)    AS total_available,
            COALESCE(SUM(eb.total_utility_sales_kwh), 0)        AS total_sales,
            COALESCE(SUM(eb.system_loss_kwh), 0)         AS total_loss,
            COALESCE(SUM(0), 0)          AS total_auxiliary,
            CASE WHEN SUM(eb.total_available_energy_kwh) > 0
                 THEN ROUND(CAST(SUM(eb.system_loss_kwh) / SUM(eb.total_available_energy_kwh) * 100 AS NUMERIC), 2)
                 ELSE 0
            END                                        AS loss_pct,
            CASE WHEN SUM(eb.total_generation_kwh) > 0
                 THEN ROUND(CAST(SUM(0) / SUM(eb.total_generation_kwh) * 100 AS NUMERIC), 2)
                 ELSE 0
            END                                        AS aux_pct
        FROM energy_balance eb
        WHERE eb.month = :month
          AND eb.year  = :year
          {office_filter}
    """)

    # ── PREVIOUS MONTH KPI (for delta calc) ───────────────────
    prev_month = month - 1 if month > 1 else 12
    prev_year  = year if month > 1 else year - 1
    prev_params = {"month": prev_month, "year": prev_year}
    if office_id:
        prev_params["oid"] = office_id

    prev_kpi_sql = text(f"""
        SELECT
            COALESCE(SUM(total_generation_kwh), 0) AS total_gen,
            COALESCE(SUM(total_utility_sales_kwh), 0)      AS total_sales,
            COALESCE(SUM(system_loss_kwh), 0)       AS total_loss
        FROM energy_balance
        WHERE month = :month AND year = :year
          {office_filter}
    """)

    # ── 12-MONTH ROLLING TREND ─────────────────────────────────
    trend_sql = text(f"""
        SELECT
            eb.month,
            eb.year,
            COALESCE(SUM(eb.total_generation_kwh), 0) AS generation_mu,
            COALESCE(SUM(eb.total_utility_sales_kwh), 0)      AS sales_mu,
            COALESCE(SUM(eb.system_loss_kwh), 0)       AS loss_mu,
            COALESCE(SUM(eb.total_import_kwh), 0)     AS import_mu,
            CASE WHEN SUM(eb.total_available_energy_kwh) > 0
                 THEN ROUND(CAST(SUM(eb.system_loss_kwh) / SUM(eb.total_available_energy_kwh) * 100 AS NUMERIC), 2)
                 ELSE 0
            END                                      AS loss_pct
        FROM energy_balance eb
        WHERE (eb.year * 100 + eb.month) BETWEEN (:year - 1) * 100 + :month AND :year * 100 + :month
          {office_filter}
        GROUP BY eb.year, eb.month
        ORDER BY eb.year, eb.month
        LIMIT 12
    """)

    # ── TOP 5 PLANTS ──────────────────────────────────────────
    top_plants_sql = text(f"""
        SELECT
            p.id        AS plant_id,
            p.name      AS plant_name,
            p.fuel_type,
            p.capacity_mw,
            COALESCE(SUM(mr.active_energy_kwh) / 1000000.0, 0) AS net_gen_mu,
            0 AS plant_factor
        FROM plants p
        LEFT JOIN meters m ON m.plant_id = p.id
        LEFT JOIN mod_readings mr ON mr.meter_id = m.id
           AND mr.month = :month AND mr.year = :year
        WHERE p.status = 'Active'
        GROUP BY p.id, p.name, p.fuel_type, p.capacity_mw
        ORDER BY net_gen_mu DESC
        LIMIT 5
    """)

    # ── EXECUTE ALL QUERIES CONCURRENTLY ──────────────────────
    import asyncio

    async def _kpi() -> dict:
        r = await db.execute(kpi_sql, bind_params)
        return dict(r.mappings().first() or {})

    async def _prev_kpi() -> dict:
        r = await db.execute(prev_kpi_sql, prev_params)
        return dict(r.mappings().first() or {})

    async def _trend() -> list[dict]:
        r = await db.execute(trend_sql, bind_params)
        return [dict(row) for row in r.mappings().all()]

    async def _top_plants() -> list[dict]:
        r = await db.execute(top_plants_sql, bind_params)
        return [dict(row) for row in r.mappings().all()]

    kpi = await _kpi()
    prev_kpi = await _prev_kpi()
    trend_rows = await _trend()
    plant_rows = await _top_plants()

    # ── BUILD KPI CARDS ───────────────────────────────────────
    def _delta(current: Decimal, previous: Decimal) -> Optional[Decimal]:
        if previous and previous != 0:
            return round((current - previous) / previous * 100, 2)
        return None

    gen_now  = Decimal(str(kpi.get("total_gen", 0)))
    gen_prev = Decimal(str(prev_kpi.get("total_gen", 0)))
    sal_now  = Decimal(str(kpi.get("total_sales", 0)))
    sal_prev = Decimal(str(prev_kpi.get("total_sales", 0)))
    los_now  = Decimal(str(kpi.get("total_loss", 0)))
    los_prev = Decimal(str(prev_kpi.get("total_loss", 0)))

    def _trend_dir(delta: Optional[Decimal]) -> str:
        if delta is None: return "stable"
        return "up" if delta > 0 else "down"

    gen_delta  = _delta(gen_now, gen_prev)
    sal_delta  = _delta(sal_now, sal_prev)
    loss_delta = _delta(los_now, los_prev)

    kpi_cards: list[KPICard] = [
        KPICard(
            label="Total Generation",
            value=gen_now,
            unit="MU",
            delta_pct=gen_delta,
            delta_label="vs last month",
            trend=_trend_dir(gen_delta),
        ),
        KPICard(
            label="Cross-Border Import",
            value=Decimal(str(kpi.get("total_import", 0))),
            unit="MU",
            trend="stable",
        ),
        KPICard(
            label="Total Available",
            value=Decimal(str(kpi.get("total_available", 0))),
            unit="MU",
            trend="stable",
        ),
        KPICard(
            label="Total Sales",
            value=sal_now,
            unit="MU",
            delta_pct=sal_delta,
            delta_label="vs last month",
            trend=_trend_dir(sal_delta),
        ),
        KPICard(
            label="System Loss",
            value=los_now,
            unit="MU",
            delta_pct=loss_delta,
            delta_label="vs last month",
            trend=_trend_dir(loss_delta),
        ),
        KPICard(
            label="Auxiliary Consumption",
            value=Decimal(str(kpi.get("total_auxiliary", 0))),
            unit="MU",
            trend="stable",
        ),
    ]

    # ── BUILD TREND POINTS ────────────────────────────────────
    monthly_trends: list[MonthlyTrendPoint] = [
        MonthlyTrendPoint(
            month=r["month"],
            year=r["year"],
            generation_mu=Decimal(str(r["generation_mu"])),
            sales_mu=Decimal(str(r["sales_mu"])),
            loss_mu=Decimal(str(r["loss_mu"])),
            import_mu=Decimal(str(r["import_mu"])),
            loss_pct=Decimal(str(r["loss_pct"])),
        )
        for r in trend_rows
    ]

    # ── BUILD TOP PLANTS ──────────────────────────────────────
    fuel_map = {'Gas': 'Natural Gas', 'HFO': 'HFO', 'Coal': 'Coal', 'Oil': 'Furnace Oil', 'Diesel': 'Diesel', 'Water': 'Hydro', 'Solar': 'Solar', 'Natural Gas': 'Natural Gas', 'Furnace Oil': 'Furnace Oil', 'Hydro': 'Hydro'}
    top_plants: list[TopPlantEntry] = [
        TopPlantEntry(
            plant_id=uuid.UUID(int=int(r["plant_id"])) if isinstance(r["plant_id"], int) else uuid.UUID(str(r["plant_id"])),
            plant_name=r["plant_name"],
            fuel_type=fuel_map.get(str(r["fuel_type"]), "Natural Gas"),
            net_gen_mu=Decimal(str(r["net_gen_mu"])),
            capacity_mw=Decimal(str(r["capacity_mw"])),
            plant_factor=Decimal(str(r["plant_factor"])),
        )
        for r in plant_rows
    ]

    return DashboardResponse(
        month=month,
        year=year,
        office_id=office_id,
        kpi_cards=kpi_cards,
        monthly_trends=monthly_trends,
        top_plants=top_plants,
        generated_at=datetime.now(tz=timezone.utc),
    )


# ── COMPANY SEGMENTED ANALYSIS ────────────────────────────────

@analytics_router.get(
    "/company",
    response_model=CompanyAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Loss and generation analysis segmented by public/private ownership",
)
async def get_company_analytics(
    current_user: AuthUser,
    db:           Session,
    month: int        = Query(..., ge=1, le=12),
    year:  int        = Query(..., ge=2000, le=2100),
    office_id: Optional[uuid.UUID] = Query(None),
) -> CompanyAnalyticsResponse:
    """
    Returns generation, sales, and loss metrics segmented by company ownership
    (public sector vs private sector) for a given month/year.
    Includes month-over-month delta percentage.
    """
    office_filter = "AND p.office_id = :oid" if office_id else ""
    bind: dict    = {"month": month, "year": year}
    if office_id:
        bind["oid"] = office_id

    prev_month = month - 1 if month > 1 else 12
    prev_year  = year if month > 1 else year - 1
    prev_bind  = {"month": prev_month, "year": prev_year}
    if office_id:
        prev_bind["oid"] = office_id

    seg_sql = text(f"""
        SELECT
            uc.name                                              AS company_name,
            p.ownership,
            COALESCE(SUM(mr.gross_gen_kwh) / 1000000.0, 0)     AS total_gen_mu,
            COALESCE(SUM(mr.active_energy_kwh)   / 1000000.0, 0)     AS net_gen_mu,
            COALESCE(SUM(us.energy_sold_mu), 0)                 AS sales_mu,
            COALESCE(
                SUM(mr.active_energy_kwh) / 1000000.0
                - COALESCE(SUM(us.energy_sold_mu), 0),
                0
            )                                                   AS loss_mu,
            CASE
                WHEN SUM(mr.active_energy_kwh) > 0
                THEN ROUND(CAST(
                        (SUM(mr.active_energy_kwh) / 1000000.0 - COALESCE(SUM(us.energy_sold_mu) AS NUMERIC), 0))
                        / (SUM(mr.active_energy_kwh) / 1000000.0) * 100,
                    2)
                ELSE 0
            END                                                 AS loss_pct
        FROM plants p
        JOIN utility_companies uc ON uc.id = p.utility_company_id
        LEFT JOIN mod_readings mr
            ON mr.meter_id = m.id
           AND mr.month    = :month
           AND mr.year     = :year
        LEFT JOIN utility_sales us
            ON us.utility_company_id = uc.id
           AND us.month              = :month
           AND us.year               = :year
        WHERE p.status = 'Active'
          {office_filter}
        GROUP BY uc.name, p.ownership
        ORDER BY p.ownership, total_gen_mu DESC
    """)

    prev_seg_sql = text(f"""
        SELECT
            uc.name                                          AS company_name,
            COALESCE(SUM(mr.active_energy_kwh) / 1000000.0, 0)   AS net_gen_mu
        FROM plants p
        JOIN utility_companies uc ON uc.id = p.utility_company_id
        LEFT JOIN mod_readings mr
            ON mr.meter_id = m.id
           AND mr.month    = :month
           AND mr.year     = :year
        WHERE p.status = 'Active'
          {office_filter}
        GROUP BY uc.name
    """)

    import asyncio

    async def _seg() -> list[dict]:
        r = await db.execute(seg_sql, bind)
        return [dict(row) for row in r.mappings().all()]

    async def _prev() -> dict[str, Decimal]:
        r = await db.execute(prev_seg_sql, prev_bind)
        return {row["company_name"]: Decimal(str(row["net_gen_mu"])) for row in r.mappings().all()}

    rows, prev_map = await asyncio.gather(_seg(), _prev())

    segments: list[CompanySegmentEntry] = []
    for r in rows:
        prev_gen  = prev_map.get(r["company_name"], Decimal("0"))
        curr_gen  = Decimal(str(r["net_gen_mu"]))
        mom_delta: Optional[Decimal] = None
        if prev_gen and prev_gen != 0:
            mom_delta = round((curr_gen - prev_gen) / prev_gen * 100, 2)

        segments.append(
            CompanySegmentEntry(
                company_name=r["company_name"],
                ownership=OwnershipEnum(r["ownership"]),
                total_gen_mu=Decimal(str(r["total_gen_mu"])),
                net_gen_mu=curr_gen,
                sales_mu=Decimal(str(r["sales_mu"])),
                loss_mu=Decimal(str(r["loss_mu"])),
                loss_pct=Decimal(str(r["loss_pct"])),
                mom_delta_pct=mom_delta,
            )
        )

    return CompanyAnalyticsResponse(month=month, year=year, segments=segments)


# ── VOLTAGE SEGMENTED ANALYSIS ────────────────────────────────

@analytics_router.get(
    "/voltage",
    response_model=VoltageAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Generation and loss analysis grouped by transmission voltage levels",
)
async def get_voltage_analytics(
    current_user: AuthUser,
    db:           Session,
    month: int        = Query(..., ge=1, le=12),
    year:  int        = Query(..., ge=2000, le=2100),
    office_id: Optional[uuid.UUID] = Query(None),
) -> VoltageAnalyticsResponse:
    """
    Returns generation, import, sales, and loss broken down by voltage level:
    400kV / 230kV / 132kV / 33kV / 11kV.

    Cross-border import circuits are bucketed into their defined voltage levels.
    """
    office_filter = "AND p.office_id = :oid" if office_id else ""
    bind: dict    = {"month": month, "year": year}
    if office_id:
        bind["oid"] = office_id

    # Plant-side generation by voltage
    gen_sql = text(f"""
        SELECT
            p.voltage_level,
            COUNT(DISTINCT p.id)                             AS plant_count,
            COALESCE(SUM(mr.gross_gen_kwh) / 1000000.0, 0)  AS total_gen_mu,
            COALESCE(SUM(mr.active_energy_kwh)   / 1000000.0, 0)  AS net_gen_mu,
            COALESCE(SUM(mr.station_use_kwh) / 1000000.0, 0) AS auxiliary_mu
        FROM plants p
        LEFT JOIN mod_readings mr
            ON mr.meter_id = m.id
           AND mr.month    = :month
           AND mr.year     = :year
        WHERE p.status = 'Active'
          {office_filter}
        GROUP BY p.voltage_level
    """)

    # Cross-border import by voltage
    import_sql = text("""
        SELECT
            cb.voltage_level,
            COALESCE(SUM(cbr.energy_mu), 0) AS import_mu
        FROM cross_border_circuits cb
        LEFT JOIN cross_border_readings cbr
            ON cbr.circuit_id = cb.id
           AND cbr.month      = :month
           AND cbr.year       = :year
        WHERE cb.is_active = TRUE
          AND cb.direction  = 'import'
        GROUP BY cb.voltage_level
    """)

    # Utility sales by voltage (joined via plant voltage assignment)
    sales_sql = text(f"""
        SELECT
            p.voltage_level,
            COALESCE(SUM(us.energy_sold_mu), 0) AS sales_mu
        FROM utility_sales us
        JOIN utility_companies uc ON uc.id = us.utility_company_id
        JOIN plants p ON p.utility_company_id = uc.id AND p.status = 'Active'
        WHERE us.month = :month
          AND us.year  = :year
          {office_filter}
        GROUP BY p.voltage_level
    """)

    import asyncio

    async def _gen() -> list[dict]:
        r = await db.execute(gen_sql, bind)
        return [dict(row) for row in r.mappings().all()]

    async def _import() -> dict[str, Decimal]:
        r = await db.execute(import_sql, bind)
        return {row["voltage_level"]: Decimal(str(row["import_mu"])) for row in r.mappings().all()}

    async def _sales() -> dict[str, Decimal]:
        r = await db.execute(sales_sql, bind)
        return {row["voltage_level"]: Decimal(str(row["sales_mu"])) for row in r.mappings().all()}

    gen_rows, import_map, sales_map = await asyncio.gather(_gen(), _import(), _sales())

    # Build voltage segments — include all voltages with any data
    voltage_map: dict[str, dict] = {}
    for r in gen_rows:
        vl = r["voltage_level"]
        voltage_map[vl] = {
            "voltage_level": vl,
            "plant_count":   int(r["plant_count"]),
            "total_gen_mu":  Decimal(str(r["total_gen_mu"])),
            "net_gen_mu":    Decimal(str(r["net_gen_mu"])),
            "auxiliary_mu":  Decimal(str(r["auxiliary_mu"])),
        }

    for vl, imp in import_map.items():
        if vl not in voltage_map:
            voltage_map[vl] = {
                "voltage_level": vl, "plant_count": 0,
                "total_gen_mu": Decimal("0"), "net_gen_mu": Decimal("0"),
                "auxiliary_mu": Decimal("0"),
            }
        voltage_map[vl]["import_mu"] = imp

    segments: list[VoltageSegmentEntry] = []
    voltage_order = ["400kV", "230kV", "132kV", "33kV", "11kV"]
    for vl in voltage_order:
        if vl not in voltage_map:
            continue
        data     = voltage_map[vl]
        gen_mu   = data.get("total_gen_mu", Decimal("0"))
        imp_mu   = data.get("import_mu",    Decimal("0"))
        avail_mu = gen_mu + imp_mu
        sal_mu   = sales_map.get(vl, Decimal("0"))
        loss_mu  = avail_mu - sal_mu
        loss_pct = (
            round(loss_mu / avail_mu * 100, 2) if avail_mu > 0 else Decimal("0")
        )

        try:
            volt_enum = VoltageEnum(vl)
        except ValueError:
            continue

        segments.append(
            VoltageSegmentEntry(
                voltage_level=volt_enum,
                total_gen_mu=gen_mu,
                import_mu=imp_mu,
                available_mu=avail_mu,
                sales_mu=sal_mu,
                loss_mu=max(loss_mu, Decimal("0")),
                loss_pct=max(loss_pct, Decimal("0")),
                plant_count=data.get("plant_count", 0),
            )
        )

    return VoltageAnalyticsResponse(month=month, year=year, segments=segments)

router = auth_router

from fastapi import APIRouter as _R
router = _R()
router.include_router(auth_router)
router.include_router(analytics_router)
