"""
engine_services.py — Core Business Engine Services

Contains three tightly coupled engines that form the BPDB calculation
and intelligence backbone:

  1. AnomalyEngine        — Detects generation drops, loss spikes, missing readings
  2. EnergyBalanceService — Aggregates and persists monthly energy balance
  3. ForecastService      — 12-month moving average with seasonal weighting

All services are async and accept an injected AsyncSession so they can be
called from FastAPI request handlers and ARQ background workers identically.
"""
from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone
from statistics import mean, stdev
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cross_border import CrossBorderReading
from app.models.energy_balance import EnergyBalance
from app.models.meter import Meter
from app.models.mod_reading import MODReading
from app.models.plant import Plant
from app.models.system_logs import (
    AnomalyAlert,
    AlertSeverity,
    Forecast,
    Notification,
    NotificationType,
)
from app.models.utility_sales import UtilitySales
from app.utils.calculations import (
    AUXILIARY_SPIKE_THRESHOLD_PCT,
    GENERATION_DROP_WARNING_PCT,
    SYSTEM_LOSS_WARNING_PCT,
    calculate_energy_balance,
    calculate_generation_drop_percent,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Runtime threshold resolution (env → default fallback)
# ---------------------------------------------------------------------------

def _loss_threshold() -> float:
    return float(os.getenv("LOSS_THRESHOLD_PERCENT", SYSTEM_LOSS_WARNING_PCT))


def _aux_threshold() -> float:
    return float(os.getenv("AUXILIARY_SPIKE_THRESHOLD_PERCENT", AUXILIARY_SPIKE_THRESHOLD_PCT))


def _gen_drop_threshold() -> float:
    return float(os.getenv("GENERATION_DROP_THRESHOLD_PERCENT", GENERATION_DROP_WARNING_PCT))


# ===========================================================================
# 1. AnomalyEngine
# ===========================================================================

class AnomalyEngine:
    """
    Scans MOD data for a given month and raises AnomalyAlert records.

    Checks performed
    ----------------
    - GenerationDrop  : >N% MoM decline in net generation per plant
    - SystemLoss      : Monthly system loss > configured threshold
    - AuxiliarySpike  : Station use % > configured threshold per meter
    - MissingReading  : Active meters with no MODReading entry for the month
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def run_scan(self, month: int, year: int) -> list[AnomalyAlert]:
        """Execute all anomaly checks and persist any new alerts. Returns list of new alerts."""
        alerts: list[AnomalyAlert] = []

        alerts += await self._check_generation_drops(month, year)
        alerts += await self._check_system_loss(month, year)
        alerts += await self._check_auxiliary_spikes(month, year)
        alerts += await self._check_missing_readings(month, year)

        if alerts:
            self.db.add_all(alerts)
            await self.db.flush()
            logger.info("AnomalyEngine: %d alerts raised for %d/%d", len(alerts), month, year)
        else:
            logger.info("AnomalyEngine: No anomalies for %d/%d", month, year)

        return alerts

    # ------------------------------------------------------------------
    # Check: Generation Drop > N% MoM
    # ------------------------------------------------------------------

    async def _check_generation_drops(self, month: int, year: int) -> list[AnomalyAlert]:
        alerts = []
        threshold = _gen_drop_threshold()

        # Previous month navigation
        prev_month = month - 1 if month > 1 else 12
        prev_year = year if month > 1 else year - 1

        # Aggregate net generation per plant for current and previous month
        async def _plant_net(m: int, y: int) -> dict[int, float]:
            """Returns {plant_id: total_active_energy_kwh}"""
            stmt = (
                select(
                    Meter.plant_id,
                    func.sum(MODReading.active_energy_kwh).label("total"),
                )
                .join(MODReading, MODReading.meter_id == Meter.id)
                .where(
                    and_(
                        MODReading.month == m,
                        MODReading.year == y,
                        Meter.meter_type == "Main",
                        Meter.direction == "Export",
                    )
                )
                .group_by(Meter.plant_id)
            )
            result = await self.db.execute(stmt)
            return {row.plant_id: float(row.total or 0) for row in result}

        current = await _plant_net(month, year)
        previous = await _plant_net(prev_month, prev_year)

        for plant_id, curr_kwh in current.items():
            prev_kwh = previous.get(plant_id, 0.0)
            drop = calculate_generation_drop_percent(curr_kwh, prev_kwh)

            if drop["drop_warning"]:
                alerts.append(
                    AnomalyAlert(
                        type="GenerationDrop",
                        severity=AlertSeverity.High,
                        description=(
                            f"Generation for plant_id={plant_id} dropped "
                            f"{drop['drop_percent']:.2f}% MoM "
                            f"(prev={prev_kwh/1e6:.3f} MU → curr={curr_kwh/1e6:.3f} MU). "
                            f"Threshold: {threshold}%."
                        ),
                        entity_type="Plant",
                        entity_id=plant_id,
                        is_resolved=False,
                    )
                )

        return alerts

    # ------------------------------------------------------------------
    # Check: System Loss > threshold
    # ------------------------------------------------------------------

    async def _check_system_loss(self, month: int, year: int) -> list[AnomalyAlert]:
        alerts = []
        threshold = _loss_threshold()

        balance_stmt = select(EnergyBalance).where(
            and_(EnergyBalance.month == month, EnergyBalance.year == year)
        )
        result = await self.db.execute(balance_stmt)
        balance = result.scalar_one_or_none()

        if balance and balance.system_loss_percent > threshold:
            severity = (
                AlertSeverity.Critical
                if balance.system_loss_percent > threshold * 1.5
                else AlertSeverity.High
            )
            alerts.append(
                AnomalyAlert(
                    type="SystemLoss",
                    severity=severity,
                    description=(
                        f"System loss {balance.system_loss_percent:.2f}% "
                        f"exceeds threshold {threshold}% for {month}/{year}. "
                        f"Loss: {balance.system_loss_kwh/1e6:.3f} MU "
                        f"on {balance.total_available_energy_kwh/1e6:.3f} MU available."
                    ),
                    entity_type="EnergyBalance",
                    entity_id=balance.id,
                    is_resolved=False,
                )
            )

        return alerts

    # ------------------------------------------------------------------
    # Check: Auxiliary Spike > threshold per meter
    # ------------------------------------------------------------------

    async def _check_auxiliary_spikes(self, month: int, year: int) -> list[AnomalyAlert]:
        alerts = []
        threshold = _aux_threshold()

        # Fetch export + station pairs per plant
        plants_stmt = select(Plant).where(Plant.status == "Active")
        plants_res = await self.db.execute(plants_stmt)
        active_plants = plants_res.scalars().all()

        for plant in active_plants:
            # Sum export energy
            export_stmt = (
                select(func.sum(MODReading.active_energy_kwh))
                .join(Meter, Meter.id == MODReading.meter_id)
                .where(
                    and_(
                        Meter.plant_id == plant.id,
                        Meter.direction == "Export",
                        Meter.meter_type == "Main",
                        MODReading.month == month,
                        MODReading.year == year,
                    )
                )
            )
            # Sum station use energy
            station_stmt = (
                select(func.sum(MODReading.active_energy_kwh))
                .join(Meter, Meter.id == MODReading.meter_id)
                .where(
                    and_(
                        Meter.plant_id == plant.id,
                        Meter.direction == "Station",
                        Meter.meter_type == "Main",
                        MODReading.month == month,
                        MODReading.year == year,
                    )
                )
            )

            exp_res = await self.db.execute(export_stmt)
            sta_res = await self.db.execute(station_stmt)

            gross = float(exp_res.scalar() or 0)
            station = float(sta_res.scalar() or 0)

            if gross <= 0:
                continue

            aux_pct = (station / gross) * 100.0

            if aux_pct > threshold:
                alerts.append(
                    AnomalyAlert(
                        type="AuxiliarySpike",
                        severity=AlertSeverity.Medium,
                        description=(
                            f"Plant '{plant.name}' auxiliary consumption {aux_pct:.2f}% "
                            f"exceeds threshold {threshold}% for {month}/{year}. "
                            f"Station use: {station/1e6:.4f} MU, Gross: {gross/1e6:.4f} MU."
                        ),
                        entity_type="Plant",
                        entity_id=plant.id,
                        is_resolved=False,
                    )
                )

        return alerts

    # ------------------------------------------------------------------
    # Check: Missing Readings for active meters
    # ------------------------------------------------------------------

    async def _check_missing_readings(self, month: int, year: int) -> list[AnomalyAlert]:
        alerts = []

        # Get all active-plant Main meter IDs
        main_meters_stmt = (
            select(Meter.id, Meter.meter_number, Meter.plant_id)
            .join(Plant, Plant.id == Meter.plant_id)
            .where(
                and_(
                    Plant.status == "Active",
                    Meter.meter_type == "Main",
                )
            )
        )
        meters_res = await self.db.execute(main_meters_stmt)
        all_meters = meters_res.all()

        # Get meter IDs that already have readings this month
        readings_stmt = select(MODReading.meter_id).where(
            and_(MODReading.month == month, MODReading.year == year)
        )
        readings_res = await self.db.execute(readings_stmt)
        meters_with_readings = {row[0] for row in readings_res}

        for meter_id, meter_number, plant_id in all_meters:
            if meter_id not in meters_with_readings:
                alerts.append(
                    AnomalyAlert(
                        type="MissingReading",
                        severity=AlertSeverity.High,
                        description=(
                            f"No MOD reading found for meter '{meter_number}' "
                            f"(id={meter_id}, plant_id={plant_id}) for {month}/{year}. "
                            "Data entry may be incomplete."
                        ),
                        entity_type="Meter",
                        entity_id=meter_id,
                        is_resolved=False,
                    )
                )

        return alerts


# ===========================================================================
# 2. EnergyBalanceService
# ===========================================================================

class EnergyBalanceService:
    """
    Aggregates all monthly generation and sales data into an EnergyBalance record.

    Flow
    ----
    1. Sum net generation (active_energy_kwh) from all Main Export meters.
    2. Sum cross-border imports (active_energy_kwh) from cross_border_readings.
    3. Sum all utility sales (active_energy_kwh) from utility_sales.
    4. Compute system loss via calculate_energy_balance().
    5. Upsert EnergyBalance for (month, year).
    6. Optionally cascade: re-run AnomalyEngine after update.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def compute_and_persist(
        self,
        month: int,
        year: int,
        trigger_anomaly_scan: bool = True,
    ) -> EnergyBalance:
        """
        Recompute energy balance for a month and write to DB.

        Returns the upserted EnergyBalance ORM instance.
        """
        # --- 1. Plant net generation ---
        gen_stmt = (
            select(func.sum(MODReading.active_energy_kwh))
            .join(Meter, Meter.id == MODReading.meter_id)
            .where(
                and_(
                    MODReading.month == month,
                    MODReading.year == year,
                    Meter.meter_type == "Main",
                    Meter.direction == "Export",
                )
            )
        )
        gen_res = await self.db.execute(gen_stmt)
        total_gen_kwh = float(gen_res.scalar() or 0.0)

        # --- 2. Cross-border imports ---
        import_stmt = select(func.sum(CrossBorderReading.active_energy_kwh)).where(
            and_(
                CrossBorderReading.month == month,
                CrossBorderReading.year == year,
            )
        )
        import_res = await self.db.execute(import_stmt)
        total_import_kwh = float(import_res.scalar() or 0.0)

        # --- 3. Utility sales ---
        sales_stmt = select(func.sum(UtilitySales.active_energy_kwh)).where(
            and_(
                UtilitySales.month == month,
                UtilitySales.year == year,
            )
        )
        sales_res = await self.db.execute(sales_stmt)
        total_sales_kwh = float(sales_res.scalar() or 0.0)

        # --- 4. Calculate balance ---
        balance_result = calculate_energy_balance(
            plant_net_kwh_list=[total_gen_kwh],
            cross_border_import_kwh_list=[total_import_kwh],
            utility_sales_kwh_list=[total_sales_kwh],
            loss_threshold=_loss_threshold(),
        )

        # --- 5. Upsert ---
        existing_stmt = select(EnergyBalance).where(
            and_(EnergyBalance.month == month, EnergyBalance.year == year)
        )
        existing_res = await self.db.execute(existing_stmt)
        record = existing_res.scalar_one_or_none()

        if record is None:
            record = EnergyBalance(month=month, year=year)
            self.db.add(record)

        record.total_generation_kwh = balance_result.total_generation_kwh
        record.total_import_kwh = balance_result.total_import_kwh
        record.total_available_energy_kwh = balance_result.total_available_kwh
        record.total_utility_sales_kwh = balance_result.total_sales_kwh
        record.system_loss_kwh = balance_result.loss_kwh
        record.system_loss_percent = balance_result.loss_percent
        record.calculated_at = datetime.now(timezone.utc)

        await self.db.flush()

        logger.info(
            "EnergyBalance %d/%d — gen=%.2f MU, import=%.2f MU, "
            "sales=%.2f MU, loss=%.2f%% (%.2f MU)",
            month, year,
            total_gen_kwh / 1e6,
            total_import_kwh / 1e6,
            total_sales_kwh / 1e6,
            balance_result.loss_percent,
            balance_result.loss_kwh / 1e6,
        )

        # --- 6. Cascade anomaly scan ---
        if trigger_anomaly_scan:
            engine = AnomalyEngine(self.db)
            await engine.run_scan(month, year)

        return record

    async def cascade_recalculate_after_adjustment(
        self,
        month: int,
        year: int,
    ) -> EnergyBalance:
        """
        Called when an Adjustment is approved that affects energy figures.
        Re-runs full balance computation and anomaly scan.
        """
        logger.info(
            "Cascade recalculation triggered by approved adjustment for %d/%d",
            month, year,
        )
        return await self.compute_and_persist(month, year, trigger_anomaly_scan=True)


# ===========================================================================
# 3. ForecastService
# ===========================================================================

class ForecastService:
    """
    Zero-external-dependency statistical forecast engine.

    Method: 12-month centred moving average with seasonal weight
    adjustment (ratio-to-moving-average decomposition).

    The 12 seasonal indices are derived from historical data.
    If fewer than 13 months of history exist, a simple 3-month
    weighted average is used as fallback.
    """

    # Seasonal weight exponent — higher = more weight to recent months
    _RECENCY_DECAY: float = 0.85

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def forecast_plant_generation(
        self,
        plant_id: int,
        horizon_month: int,
        horizon_year: int,
    ) -> Optional[Forecast]:
        """Forecast next-month generation for a single plant and persist it."""
        history = await self._fetch_generation_history(plant_id)
        if len(history) < 3:
            logger.warning(
                "Insufficient history for plant_id=%d (only %d months). Skipping forecast.",
                plant_id, len(history),
            )
            return None

        predicted, lower, upper = self._compute_forecast(history, horizon_month)

        record = await self._upsert_forecast(
            target_type="Plant",
            target_id=plant_id,
            horizon_month=horizon_month,
            horizon_year=horizon_year,
            predicted=predicted,
            lower=lower,
            upper=upper,
        )
        return record

    async def forecast_system_loss(
        self,
        horizon_month: int,
        horizon_year: int,
    ) -> Optional[Forecast]:
        """Forecast system loss % for the next month."""
        history = await self._fetch_loss_history()
        if len(history) < 3:
            return None

        predicted, lower, upper = self._compute_forecast(history, horizon_month)

        return await self._upsert_forecast(
            target_type="SystemLoss",
            target_id=None,
            horizon_month=horizon_month,
            horizon_year=horizon_year,
            predicted=predicted,
            lower=lower,
            upper=upper,
        )

    async def run_all_forecasts(
        self,
        horizon_month: int,
        horizon_year: int,
    ) -> dict[str, int]:
        """
        Run generation forecasts for all active plants + system loss.
        Returns summary counts.
        """
        plants_stmt = select(Plant.id).where(Plant.status == "Active")
        plants_res = await self.db.execute(plants_stmt)
        plant_ids = [row[0] for row in plants_res]

        success, skipped = 0, 0
        for pid in plant_ids:
            result = await self.forecast_plant_generation(pid, horizon_month, horizon_year)
            if result:
                success += 1
            else:
                skipped += 1

        loss_result = await self.forecast_system_loss(horizon_month, horizon_year)
        if loss_result:
            success += 1

        await self.db.flush()
        logger.info(
            "Forecasts %d/%d: %d generated, %d skipped",
            horizon_month, horizon_year, success, skipped,
        )
        return {"generated": success, "skipped": skipped}

    # ------------------------------------------------------------------
    # History fetchers
    # ------------------------------------------------------------------

    async def _fetch_generation_history(self, plant_id: int) -> list[float]:
        """Return up to 24 months of net generation (MWh) ordered oldest-first."""
        stmt = (
            select(
                MODReading.year,
                MODReading.month,
                func.sum(MODReading.active_energy_kwh).label("total"),
            )
            .join(Meter, Meter.id == MODReading.meter_id)
            .where(
                and_(
                    Meter.plant_id == plant_id,
                    Meter.meter_type == "Main",
                    Meter.direction == "Export",
                )
            )
            .group_by(MODReading.year, MODReading.month)
            .order_by(MODReading.year.asc(), MODReading.month.asc())
            .limit(24)
        )
        res = await self.db.execute(stmt)
        return [float(row.total or 0) for row in res]

    async def _fetch_loss_history(self) -> list[float]:
        """Return up to 24 months of system loss % ordered oldest-first."""
        stmt = (
            select(EnergyBalance.system_loss_percent)
            .order_by(EnergyBalance.year.asc(), EnergyBalance.month.asc())
            .limit(24)
        )
        res = await self.db.execute(stmt)
        return [float(row[0] or 0) for row in res]

    # ------------------------------------------------------------------
    # Core statistical engine
    # ------------------------------------------------------------------

    def _compute_forecast(
        self,
        history: list[float],
        horizon_month: int,
    ) -> tuple[float, float, float]:
        """
        12-month moving average with seasonal adjustment.

        Returns (predicted_value, ci_lower, ci_upper).
        The 95% confidence interval uses ±1.96 × rolling std.
        """
        n = len(history)

        # --- Seasonal indices (ratio-to-MA) ---
        if n >= 13:
            seasonal_indices = self._compute_seasonal_indices(history)
        else:
            # Fallback: flat seasonal index = 1.0 for all months
            seasonal_indices = {m: 1.0 for m in range(1, 13)}

        # --- Recency-weighted moving average ---
        window = min(12, n)
        recent = history[-window:]
        weights = [self._RECENCY_DECAY ** (window - 1 - i) for i in range(window)]
        total_weight = sum(weights)
        weighted_avg = sum(v * w for v, w in zip(recent, weights)) / total_weight

        # --- Apply seasonal index ---
        seasonal_factor = seasonal_indices.get(horizon_month, 1.0)
        predicted = weighted_avg * seasonal_factor

        # --- 95% CI using rolling std ---
        if n >= 3:
            try:
                sd = stdev(recent)
            except Exception:
                sd = 0.0
        else:
            sd = predicted * 0.05   # Default 5% uncertainty

        ci_lower = max(0.0, predicted - 1.96 * sd)
        ci_upper = predicted + 1.96 * sd

        return round(predicted, 4), round(ci_lower, 4), round(ci_upper, 4)

    def _compute_seasonal_indices(self, history: list[float]) -> dict[int, float]:
        """
        Compute 12 seasonal indices using classical ratio-to-moving-average.

        Steps:
        1. Compute 12-month centred moving average.
        2. Divide each actual value by MA → seasonal ratio.
        3. Average ratios by calendar month → seasonal indices.
        4. Normalise so indices sum to 12.
        """
        n = len(history)
        half = 6   # half-window for 12-month CMA

        # Centred moving average (index half to n-half-1)
        ma: list[tuple[int, float]] = []
        for i in range(half, n - half):
            window_vals = history[i - half: i + half + 1]
            # 12-month CMA: average of 13 terms with half-weight on endpoints
            cma = (
                0.5 * window_vals[0]
                + sum(window_vals[1:12])
                + 0.5 * window_vals[12]
            ) / 12.0
            ma.append((i, cma))

        # We don't have real calendar anchoring, so map by index % 12
        ratios: dict[int, list[float]] = {m: [] for m in range(1, 13)}
        for idx, cma in ma:
            if cma > 0:
                month_key = (idx % 12) + 1
                ratios[month_key].append(history[idx] / cma)

        # Average ratios per month
        raw_indices: dict[int, float] = {}
        for m in range(1, 13):
            if ratios[m]:
                raw_indices[m] = mean(ratios[m])
            else:
                raw_indices[m] = 1.0

        # Normalise
        total = sum(raw_indices.values())
        factor = 12.0 / total if total > 0 else 1.0
        return {m: v * factor for m, v in raw_indices.items()}

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    async def _upsert_forecast(
        self,
        target_type: str,
        target_id: Optional[int],
        horizon_month: int,
        horizon_year: int,
        predicted: float,
        lower: float,
        upper: float,
    ) -> Forecast:
        stmt = select(Forecast).where(
            and_(
                Forecast.target_type == target_type,
                Forecast.target_id == target_id,
                Forecast.horizon_month == horizon_month,
                Forecast.horizon_year == horizon_year,
            )
        )
        res = await self.db.execute(stmt)
        record = res.scalar_one_or_none()

        if record is None:
            record = Forecast(
                target_type=target_type,
                target_id=target_id,
                horizon_month=horizon_month,
                horizon_year=horizon_year,
            )
            self.db.add(record)

        record.predicted_value = predicted
        record.confidence_interval_lower = lower
        record.confidence_interval_upper = upper
        record.generated_at = datetime.now(timezone.utc)

        await self.db.flush()
        return record
