"""
arq_worker.py — GridIntel ARQ Background Worker

Defines all async cron tasks and the ARQ WorkerSettings class.

Tasks
-----
task_generate_monthly_report    — Aggregates metrics, writes Report record
task_run_anomaly_scan           — Nightly anomaly detection over unlocked months
task_compute_forecasts          — Seasonal time-series forecast after month lock
task_push_notifications         — Processes pending notification queue items
task_bulk_recalculate_balance   — Triggered by adjustment flags; safe recalc

Usage
-----
Start the worker:
    arq app.workers.arq_worker.WorkerSettings

Environment variables required:
    REDIS_URL           — Redis connection string
    DATABASE_URL        — Async PostgreSQL DSN
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import and_, select

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DB session factory (worker-scoped, separate from FastAPI's)
# ---------------------------------------------------------------------------

def _make_session_factory() -> async_sessionmaker[AsyncSession]:
    database_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(
        database_url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        echo=False,
    )
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = _make_session_factory()
    return _session_factory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _current_month_year() -> tuple[int, int]:
    now = datetime.now(timezone.utc)
    return now.month, now.year


def _prev_month_year() -> tuple[int, int]:
    now = datetime.now(timezone.utc)
    first_of_month = now.replace(day=1)
    prev = first_of_month - timedelta(days=1)
    return prev.month, prev.year


def _next_month_year() -> tuple[int, int]:
    now = datetime.now(timezone.utc)
    if now.month == 12:
        return 1, now.year + 1
    return now.month + 1, now.year


# ===========================================================================
# Task 1: Generate Monthly Report
# ===========================================================================

async def task_generate_monthly_report(ctx: dict[str, Any]) -> None:
    """
    Aggregates system-wide metrics for the previous month and writes a
    MODSummary Report record.

    Triggered: 1st of each month at 02:00 UTC.
    """
    month, year = _prev_month_year()
    logger.info("[task_generate_monthly_report] Starting for %d/%d", month, year)

    async with get_session_factory()() as session:
        async with session.begin():
            try:
                from app.models.energy_balance import EnergyBalance
                from app.models.system_logs import Report, ReportType
                from sqlalchemy import select, and_

                # Fetch energy balance for the report context
                eb_stmt = select(EnergyBalance).where(
                    and_(EnergyBalance.month == month, EnergyBalance.year == year)
                )
                eb_res = await session.execute(eb_stmt)
                balance = eb_res.scalar_one_or_none()

                context_filters: dict = {
                    "month": month,
                    "year": year,
                    "generated_by": "arq_worker",
                }

                if balance:
                    context_filters.update({
                        "total_generation_mu": round(balance.total_generation_kwh / 1e6, 3),
                        "total_import_mu": round(balance.total_import_kwh / 1e6, 3),
                        "total_sales_mu": round(balance.total_utility_sales_kwh / 1e6, 3),
                        "system_loss_percent": round(balance.system_loss_percent, 2),
                    })

                report = Report(
                    title=f"MOD Summary Report — {month:02d}/{year}",
                    type=ReportType.MODSummary,
                    generated_by=None,   # System-generated
                    file_path=None,      # Set by report_worker once PDF is rendered
                    context_filters=context_filters,
                )
                session.add(report)
                await session.flush()

                logger.info(
                    "[task_generate_monthly_report] Report id=%d created for %d/%d",
                    report.id, month, year,
                )
            except Exception:
                logger.exception("[task_generate_monthly_report] FAILED for %d/%d", month, year)
                raise


# ===========================================================================
# Task 2: Nightly Anomaly Scan
# ===========================================================================

async def task_run_anomaly_scan(ctx: dict[str, Any]) -> None:
    """
    Runs AnomalyEngine over all unlocked months with available data.

    Triggered: Every night at 01:00 UTC.
    """
    logger.info("[task_run_anomaly_scan] Starting nightly scan")

    async with get_session_factory()() as session:
        async with session.begin():
            try:
                from app.models.month_lock import MonthLock
                from app.models.energy_balance import EnergyBalance
                from app.services.engine_services import AnomalyEngine
                from sqlalchemy import select, and_

                # Find months with energy balance data that are NOT locked
                locked_stmt = select(MonthLock.month, MonthLock.year).where(
                    MonthLock.is_locked.is_(True)
                )
                locked_res = await session.execute(locked_stmt)
                locked_set = {(r.month, r.year) for r in locked_res}

                # Get months with energy balance entries (last 3 months max)
                eb_stmt = (
                    select(EnergyBalance.month, EnergyBalance.year)
                    .order_by(EnergyBalance.year.desc(), EnergyBalance.month.desc())
                    .limit(3)
                )
                eb_res = await session.execute(eb_stmt)
                candidate_months = [(r.month, r.year) for r in eb_res]

                engine = AnomalyEngine(session)
                total_alerts = 0

                for month, year in candidate_months:
                    if (month, year) in locked_set:
                        logger.debug(
                            "[task_run_anomaly_scan] Skipping locked month %d/%d", month, year
                        )
                        continue
                    alerts = await engine.run_scan(month, year)
                    total_alerts += len(alerts)

                logger.info(
                    "[task_run_anomaly_scan] Complete. %d total alerts raised across %d months.",
                    total_alerts, len(candidate_months),
                )
            except Exception:
                logger.exception("[task_run_anomaly_scan] FAILED")
                raise


# ===========================================================================
# Task 3: Compute Forecasts
# ===========================================================================

async def task_compute_forecasts(ctx: dict[str, Any]) -> None:
    """
    Runs seasonal forecasts for all active plants and system loss
    for the upcoming month.

    Triggered: 2nd of each month at 03:00 UTC (after month lock + report).
    """
    horizon_month, horizon_year = _next_month_year()
    logger.info(
        "[task_compute_forecasts] Computing forecasts for horizon %d/%d",
        horizon_month, horizon_year,
    )

    async with get_session_factory()() as session:
        async with session.begin():
            try:
                from app.services.engine_services import ForecastService

                svc = ForecastService(session)
                summary = await svc.run_all_forecasts(horizon_month, horizon_year)

                logger.info(
                    "[task_compute_forecasts] Done: %d forecasts generated, %d skipped",
                    summary["generated"], summary["skipped"],
                )
            except Exception:
                logger.exception("[task_compute_forecasts] FAILED")
                raise


# ===========================================================================
# Task 4: Push Notifications
# ===========================================================================

async def task_push_notifications(ctx: dict[str, Any]) -> None:
    """
    Processes deadline reminders and broadcasts alert-based notifications.

    Deadline rules (configurable via SUBMISSION_DEADLINE_DAY env var):
        - 7 days before deadline → Info reminder
        - 3 days before deadline → Warning reminder
        - 1 day before deadline  → High-priority warning
        - Past deadline          → Overdue alert

    Triggered: Daily at 08:00 UTC (Bangladesh business hours).
    """
    logger.info("[task_push_notifications] Starting notification processor")

    deadline_day = int(os.getenv("SUBMISSION_DEADLINE_DAY", "10"))
    now = datetime.now(timezone.utc)
    current_month, current_year = now.month, now.year

    async with get_session_factory()() as session:
        async with session.begin():
            try:
                from app.models.system_logs import Notification, NotificationType, AnomalyAlert, AlertSeverity
                from app.models.mod_submission import MODSubmission, SubmissionStatus
                from app.models.user import User
                from app.models.plant import Plant
                from sqlalchemy import select, and_

                # --- Deadline reminder logic ---
                deadline_date = now.replace(day=deadline_day, hour=23, minute=59, second=59)
                days_remaining = (deadline_date - now).days

                reminder_map = {
                    7: (NotificationType.Info, "Submission Reminder (7 days)"),
                    3: (NotificationType.Warning, "Submission Reminder (3 days)"),
                    1: (NotificationType.Warning, "Urgent: Submission Due Tomorrow"),
                }

                if days_remaining in reminder_map or days_remaining < 0:
                    # Find plants with Draft/not-submitted status this month
                    draft_stmt = (
                        select(MODSubmission.plant_id)
                        .where(
                            and_(
                                MODSubmission.month == current_month,
                                MODSubmission.year == current_year,
                                MODSubmission.status.in_([
                                    SubmissionStatus.Draft,
                                ])
                            )
                        )
                    )
                    draft_res = await session.execute(draft_stmt)
                    pending_plant_ids = {r[0] for r in draft_res}

                    if days_remaining in reminder_map:
                        ntype, title_tmpl = reminder_map[days_remaining]
                    else:
                        ntype = NotificationType.Alert
                        title_tmpl = f"OVERDUE: MOD submission ({abs(days_remaining)} days late)"

                    # Notify all BPDB operator users (role-based; simplified to all active users here)
                    users_stmt = select(User.id).where(User.is_active.is_(True))
                    users_res = await session.execute(users_stmt)
                    user_ids = [r[0] for r in users_res]

                    new_notifications: list[Notification] = []
                    for uid in user_ids:
                        msg = (
                            f"{len(pending_plant_ids)} plant(s) have not submitted MOD data "
                            f"for {current_month:02d}/{current_year}. "
                            f"Deadline: {deadline_day}th of this month."
                        )
                        new_notifications.append(
                            Notification(
                                user_id=uid,
                                title=title_tmpl,
                                message=msg,
                                type=ntype,
                                is_read=False,
                            )
                        )

                    if new_notifications:
                        session.add_all(new_notifications)
                        logger.info(
                            "[task_push_notifications] %d deadline notifications dispatched",
                            len(new_notifications),
                        )

                # --- Unresolved critical anomaly notifications ---
                unresolved_stmt = (
                    select(AnomalyAlert)
                    .where(
                        and_(
                            AnomalyAlert.is_resolved.is_(False),
                            AnomalyAlert.severity == AlertSeverity.Critical,
                        )
                    )
                    .limit(50)
                )
                unresolved_res = await session.execute(unresolved_stmt)
                critical_alerts = unresolved_res.scalars().all()

                if critical_alerts:
                    # Notify system admins (simplified: all active users)
                    admin_stmt = select(User.id).where(User.is_active.is_(True))
                    admin_res = await session.execute(admin_stmt)
                    admin_ids = [r[0] for r in admin_res]

                    critical_notifications: list[Notification] = []
                    for alert in critical_alerts:
                        for uid in admin_ids:
                            critical_notifications.append(
                                Notification(
                                    user_id=uid,
                                    title=f"Critical Anomaly: {alert.type}",
                                    message=alert.description,
                                    type=NotificationType.Alert,
                                    is_read=False,
                                )
                            )

                    if critical_notifications:
                        session.add_all(critical_notifications)
                        logger.info(
                            "[task_push_notifications] %d critical anomaly notifications dispatched",
                            len(critical_notifications),
                        )

                await session.flush()
                logger.info("[task_push_notifications] Complete")

            except Exception:
                logger.exception("[task_push_notifications] FAILED")
                raise


# ===========================================================================
# Task 5: Bulk Recalculate Energy Balance
# ===========================================================================

async def task_bulk_recalculate_balance(ctx: dict[str, Any]) -> None:
    """
    Listens for approved adjustments that set a recalculation flag and
    safely re-triggers EnergyBalanceService for affected months.

    In the GridIntel system, an Adjustment record for an energy-related
    field stores the target month/year. This task queries for recently
    approved adjustments and triggers cascade recalculation.

    Triggered: Every 30 minutes (near real-time for adjustment workflows).
    """
    logger.info("[task_bulk_recalculate_balance] Checking for pending recalculations")

    async with get_session_factory()() as session:
        async with session.begin():
            try:
                from app.models.system_logs import Adjustment
                from app.services.engine_services import EnergyBalanceService
                from sqlalchemy import select, and_, distinct
                from datetime import timedelta

                # Find adjustments approved in the last 35 minutes (slight overlap for safety)
                cutoff = datetime.now(timezone.utc) - timedelta(minutes=35)

                adj_stmt = (
                    select(
                        distinct(Adjustment.month),
                        Adjustment.year,
                    )
                    .where(
                        and_(
                            Adjustment.approved_by.isnot(None),
                            Adjustment.timestamp >= cutoff,
                            Adjustment.entity_type.in_([
                                "MODReading", "CrossBorderReading",
                                "UtilitySales", "EnergyBalance",
                            ]),
                        )
                    )
                )
                adj_res = await session.execute(adj_stmt)
                affected_months = list({(r[0], r[1]) for r in adj_res if r[0] and r[1]})

                if not affected_months:
                    logger.debug("[task_bulk_recalculate_balance] No pending recalculations.")
                    return

                svc = EnergyBalanceService(session)
                recalc_count = 0

                for month, year in affected_months:
                    if not (1 <= month <= 12):
                        logger.warning(
                            "[task_bulk_recalculate_balance] Invalid month=%d, skipping", month
                        )
                        continue
                    try:
                        await svc.cascade_recalculate_after_adjustment(month, year)
                        recalc_count += 1
                    except Exception:
                        logger.exception(
                            "[task_bulk_recalculate_balance] Failed for %d/%d", month, year
                        )

                logger.info(
                    "[task_bulk_recalculate_balance] Recalculated %d month(s): %s",
                    recalc_count,
                    affected_months,
                )

            except Exception:
                logger.exception("[task_bulk_recalculate_balance] FAILED")
                raise


# ===========================================================================
# ARQ Worker Settings
# ===========================================================================

async def startup(ctx: dict[str, Any]) -> None:
    """Called once when the ARQ worker process starts."""
    logger.info("GridIntel ARQ Worker starting up...")
    # Pre-warm the session factory
    get_session_factory()
    ctx["started_at"] = datetime.now(timezone.utc)
    logger.info("ARQ Worker ready.")


async def shutdown(ctx: dict[str, Any]) -> None:
    """Called once when the ARQ worker process shuts down gracefully."""
    logger.info("GridIntel ARQ Worker shutting down.")
    if _session_factory is not None:
        await _session_factory.kw["bind"].dispose()


class WorkerSettings:
    """
    ARQ WorkerSettings — referenced by:  arq app.workers.arq_worker.WorkerSettings
    """

    redis_settings = RedisSettings.from_dsn(
        os.getenv("REDIS_URL", "redis://localhost:6379")
    )

    on_startup = startup
    on_shutdown = shutdown

    # Maximum concurrent tasks
    max_jobs = 10

    # Job timeout (seconds)
    job_timeout = 600        # 10 minutes per job max

    # Retry on failure
    allow_abort_jobs = True

    functions = [
        task_generate_monthly_report,
        task_run_anomaly_scan,
        task_compute_forecasts,
        task_push_notifications,
        task_bulk_recalculate_balance,
    ]

    cron_jobs = [
        # 1st of each month, 02:00 UTC — monthly report generation
        cron(
            task_generate_monthly_report,
            day=1,
            hour=2,
            minute=0,
            unique=True,
        ),
        # Nightly anomaly scan — 01:00 UTC
        cron(
            task_run_anomaly_scan,
            hour=1,
            minute=0,
            unique=True,
        ),
        # 2nd of each month, 03:00 UTC — forecast computation
        cron(
            task_compute_forecasts,
            day=2,
            hour=3,
            minute=0,
            unique=True,
        ),
        # Daily business-hours notification dispatch — 08:00 UTC (14:00 BDT)
        cron(
            task_push_notifications,
            hour=8,
            minute=0,
            unique=True,
        ),
        # Every 30 minutes — adjustment-triggered recalculation
        cron(
            task_bulk_recalculate_balance,
            minute={0, 30},
            unique=True,
        ),
    ]
