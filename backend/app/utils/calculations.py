"""
calculations.py — BPDB Stateless Calculation Engine

All functions are pure / stateless. They operate on primitive types so that
they can be called from synchronous validators, async services, and ARQ
background workers alike, without holding a DB session.

BPDB Formula Reference
----------------------
Gross Generation (Export meter):
    gross_kwh = (closing - opening) × multiplier × correction_factor

Station Use (Station meter):
    station_use_kwh = (closing - opening) × multiplier × correction_factor

Net Generation (Main Export):
    net_kwh = gross_kwh - station_use_kwh

Auxiliary %:
    aux_pct = (station_use_kwh / gross_kwh) × 100   [warn if > 8%]

System Loss:
    loss_kwh   = total_available_kwh - total_sales_kwh
    loss_pct   = (loss_kwh / total_available_kwh) × 100

Billing:
    gross_bill        = net_kwh × rate_per_kwh
    total_deductions  = sum(deductions_dict.values())
    net_bill          = gross_bill - total_deductions
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Literal

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Thresholds (defaults; overridden at runtime from env/settings)
# ---------------------------------------------------------------------------
AUXILIARY_SPIKE_THRESHOLD_PCT: float = 8.0   # %
SYSTEM_LOSS_WARNING_PCT: float = 16.0         # %
GENERATION_DROP_WARNING_PCT: float = 20.0     # % month-on-month


# ---------------------------------------------------------------------------
# Return types
# ---------------------------------------------------------------------------

@dataclass
class GenerationResult:
    gross_kwh: float
    station_use_kwh: float
    net_kwh: float
    auxiliary_percent: float
    auxiliary_warning: bool         # True if aux% > threshold
    direction: str                  # 'Export' | 'Import' | 'Station'

    # Raw intermediate values (useful for debugging / audit trail)
    dial_delta: float               # closing - opening
    applied_multiplier: float
    applied_correction_factor: float


@dataclass
class SystemLossResult:
    loss_kwh: float
    loss_percent: float
    total_available_kwh: float
    total_sales_kwh: float
    loss_warning: bool              # True if loss% > threshold


@dataclass
class BillingResult:
    gross_bill: float
    deductions_detail: dict[str, float]
    total_deductions: float
    net_bill: float
    rate_per_kwh: float
    net_kwh: float


@dataclass
class EnergyBalanceResult:
    total_generation_kwh: float
    total_import_kwh: float
    total_available_kwh: float
    total_sales_kwh: float
    loss_kwh: float
    loss_percent: float


# ---------------------------------------------------------------------------
# 1. Generation Calculation
# ---------------------------------------------------------------------------

def calculate_generation(
    opening: float,
    closing: float,
    multiplier: float,
    correction_factor: float,
    meter_direction: Literal["Export", "Import", "Station"],
    station_use_kwh: float = 0.0,
    aux_spike_threshold: float = AUXILIARY_SPIKE_THRESHOLD_PCT,
) -> GenerationResult:
    """
    Calculate gross, station use, and net generation for a meter reading.

    Parameters
    ----------
    opening           : Opening dial reading (MWh or kWh on meter face)
    closing           : Closing dial reading
    multiplier        : Meter CT × PT ratio
    correction_factor : Active correction factor for this meter-month
    meter_direction   : 'Export' | 'Import' | 'Station'
    station_use_kwh   : Pre-computed station use (only required for Export
                        meters when net = gross - station_use). Pass 0.0 for
                        Station-direction meters — their own consumption is
                        the station use itself.
    aux_spike_threshold : Percentage above which auxiliary warning fires.

    Returns
    -------
    GenerationResult dataclass
    """
    if multiplier <= 0:
        raise ValueError(f"Multiplier must be > 0, got {multiplier!r}")
    if correction_factor <= 0:
        raise ValueError(f"Correction factor must be > 0, got {correction_factor!r}")

    dial_delta = closing - opening

    # Allow meter rollover for very old analogue meters (5-digit dial → 99999 → 0)
    # Maximum plausible single-month delta is 10 GWh on any individual meter
    if dial_delta < 0:
        logger.warning(
            "Negative dial delta (%.4f → %.4f). Possible meter rollover.",
            opening,
            closing,
        )
        # Attempt 5-digit rollover correction
        dial_delta_corrected = (99999.9 - opening) + closing
        if dial_delta_corrected > 0:
            logger.warning("Applied 5-digit rollover correction: delta=%.4f", dial_delta_corrected)
            dial_delta = dial_delta_corrected
        else:
            # Cannot recover — return zeroed result so operator is alerted
            logger.error("Cannot recover from negative dial delta. Returning zero.")
            dial_delta = 0.0

    raw_kwh = dial_delta * multiplier * correction_factor

    if meter_direction == "Station":
        # Station meter: the raw_kwh IS the station use
        gross_kwh = 0.0
        _station_use = raw_kwh
        net_kwh = 0.0                   # Station meters don't produce net generation
    elif meter_direction == "Export":
        gross_kwh = raw_kwh
        _station_use = station_use_kwh
        net_kwh = gross_kwh - _station_use
    elif meter_direction == "Import":
        # Import from grid: treated as negative generation contribution
        gross_kwh = raw_kwh
        _station_use = station_use_kwh
        net_kwh = gross_kwh - _station_use
    else:
        raise ValueError(f"Unknown meter_direction: {meter_direction!r}")

    # Auxiliary %
    aux_pct = _calc_auxiliary_percent(gross_kwh=gross_kwh, station_use_kwh=_station_use)
    aux_warning = aux_pct > aux_spike_threshold and gross_kwh > 0

    if aux_warning:
        logger.warning(
            "Auxiliary spike detected: %.2f%% > threshold %.2f%%",
            aux_pct,
            aux_spike_threshold,
        )

    return GenerationResult(
        gross_kwh=round(gross_kwh, 4),
        station_use_kwh=round(_station_use, 4),
        net_kwh=round(net_kwh, 4),
        auxiliary_percent=round(aux_pct, 4),
        auxiliary_warning=aux_warning,
        direction=meter_direction,
        dial_delta=round(dial_delta, 6),
        applied_multiplier=multiplier,
        applied_correction_factor=correction_factor,
    )


# ---------------------------------------------------------------------------
# 2. Auxiliary % (standalone, also used by AnomalyEngine)
# ---------------------------------------------------------------------------

def _calc_auxiliary_percent(gross_kwh: float, station_use_kwh: float) -> float:
    if gross_kwh <= 0:
        return 0.0
    return (station_use_kwh / gross_kwh) * 100.0


def calculate_auxiliary_percent(
    gross_kwh: float,
    station_use_kwh: float,
    spike_threshold: float = AUXILIARY_SPIKE_THRESHOLD_PCT,
) -> dict[str, float | bool]:
    """
    Standalone auxiliary percentage calculation with threshold warning.

    Returns
    -------
    {
        'auxiliary_percent': float,
        'spike_warning':     bool,
        'threshold_used':    float,
    }
    """
    pct = _calc_auxiliary_percent(gross_kwh, station_use_kwh)
    return {
        "auxiliary_percent": round(pct, 4),
        "spike_warning": pct > spike_threshold,
        "threshold_used": spike_threshold,
    }


# ---------------------------------------------------------------------------
# 3. System Loss Calculation
# ---------------------------------------------------------------------------

def calculate_system_loss(
    total_available_kwh: float,
    total_sales_kwh: float,
    loss_threshold: float = SYSTEM_LOSS_WARNING_PCT,
) -> SystemLossResult:
    """
    BPDB system loss formula:

        Loss kWh  = Available - Sales
        Loss %    = (Loss / Available) × 100

    Parameters
    ----------
    total_available_kwh : Sum of net generation + cross-border imports
    total_sales_kwh     : Sum of all utility bulk-supply sales
    loss_threshold      : % above which warning is raised (default 16%)
    """
    if total_available_kwh < 0:
        raise ValueError(f"total_available_kwh cannot be negative: {total_available_kwh}")
    if total_sales_kwh < 0:
        raise ValueError(f"total_sales_kwh cannot be negative: {total_sales_kwh}")

    loss_kwh = total_available_kwh - total_sales_kwh

    if total_available_kwh == 0:
        loss_pct = 0.0
    else:
        loss_pct = (loss_kwh / total_available_kwh) * 100.0

    loss_warning = loss_pct > loss_threshold

    if loss_warning:
        logger.warning(
            "System loss %.2f%% exceeds threshold %.2f%%",
            loss_pct,
            loss_threshold,
        )

    return SystemLossResult(
        loss_kwh=round(loss_kwh, 4),
        loss_percent=round(loss_pct, 4),
        total_available_kwh=round(total_available_kwh, 4),
        total_sales_kwh=round(total_sales_kwh, 4),
        loss_warning=loss_warning,
    )


# ---------------------------------------------------------------------------
# 4. Energy Balance Aggregation
# ---------------------------------------------------------------------------

def calculate_energy_balance(
    plant_net_kwh_list: list[float],
    cross_border_import_kwh_list: list[float],
    utility_sales_kwh_list: list[float],
    loss_threshold: float = SYSTEM_LOSS_WARNING_PCT,
) -> EnergyBalanceResult:
    """
    Aggregate system-wide energy balance for a given month.

    Available Energy = Σ Plant Net Generation + Σ Cross-Border Imports
    System Loss      = Available - Σ Utility Sales
    """
    total_gen = sum(plant_net_kwh_list)
    total_import = sum(cross_border_import_kwh_list)
    total_available = total_gen + total_import
    total_sales = sum(utility_sales_kwh_list)

    loss = calculate_system_loss(
        total_available_kwh=total_available,
        total_sales_kwh=total_sales,
        loss_threshold=loss_threshold,
    )

    return EnergyBalanceResult(
        total_generation_kwh=round(total_gen, 4),
        total_import_kwh=round(total_import, 4),
        total_available_kwh=round(total_available, 4),
        total_sales_kwh=round(total_sales, 4),
        loss_kwh=loss.loss_kwh,
        loss_percent=loss.loss_percent,
    )


# ---------------------------------------------------------------------------
# 5. Billing Calculation
# ---------------------------------------------------------------------------

def calculate_billing(
    net_kwh: float,
    rate_per_kwh: float,
    deductions_dict: dict[str, float] | None = None,
) -> BillingResult:
    """
    BPDB billing formula:

        Gross Bill       = net_kwh × rate_per_kwh
        Total Deductions = Σ deductions_dict.values()
        Net Bill         = Gross Bill − Total Deductions

    Parameters
    ----------
    net_kwh          : Net energy delivered (kWh)
    rate_per_kwh     : Applicable tariff rate (BDT/kWh)
    deductions_dict  : Named deductions e.g.
                       {'VAT': 5000.0, 'SD': 2000.0, 'penalty': 500.0}
                       Pass None or {} for no deductions.

    Returns
    -------
    BillingResult dataclass
    """
    if net_kwh < 0:
        raise ValueError(f"net_kwh cannot be negative for billing: {net_kwh}")
    if rate_per_kwh < 0:
        raise ValueError(f"rate_per_kwh cannot be negative: {rate_per_kwh}")

    _deductions = deductions_dict or {}

    gross_bill = net_kwh * rate_per_kwh
    total_deductions = sum(_deductions.values())

    if total_deductions < 0:
        raise ValueError("Sum of deductions cannot be negative.")
    if total_deductions > gross_bill:
        logger.warning(
            "Total deductions (%.2f) exceed gross bill (%.2f). Net bill will be ≤ 0.",
            total_deductions,
            gross_bill,
        )

    net_bill = gross_bill - total_deductions

    return BillingResult(
        gross_bill=round(gross_bill, 2),
        deductions_detail=_deductions,
        total_deductions=round(total_deductions, 2),
        net_bill=round(net_bill, 2),
        rate_per_kwh=rate_per_kwh,
        net_kwh=net_kwh,
    )


# ---------------------------------------------------------------------------
# 6. Month-on-Month Generation Drop Detection
# ---------------------------------------------------------------------------

def calculate_generation_drop_percent(
    current_kwh: float,
    previous_kwh: float,
) -> dict[str, float | bool]:
    """
    Returns MoM drop percentage and whether it breaches the 20% warning.

    A positive result means generation increased; negative means drop.
    """
    if previous_kwh <= 0:
        return {
            "drop_percent": 0.0,
            "drop_warning": False,
            "direction": "insufficient_history",
        }

    change_pct = ((current_kwh - previous_kwh) / previous_kwh) * 100.0
    is_drop = change_pct < 0
    drop_pct = abs(change_pct) if is_drop else 0.0

    return {
        "drop_percent": round(drop_pct, 4),
        "change_percent": round(change_pct, 4),
        "drop_warning": drop_pct > GENERATION_DROP_WARNING_PCT and is_drop,
        "direction": "decrease" if is_drop else "increase",
    }
