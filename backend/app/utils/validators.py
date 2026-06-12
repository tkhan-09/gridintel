"""
validators.py — BPDB Data Validation Layer

Provides synchronous and async validators called from API endpoints,
background workers, and the calculation engine before persisting any
MOD reading or billing record.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Return types
# ---------------------------------------------------------------------------

@dataclass
class ContinuityCheckResult:
    is_valid: bool
    previous_closing: float
    current_opening: float
    delta: float                    # current_opening - previous_closing
    message: str


@dataclass
class OMFValidationResult:
    is_valid: bool
    omf_value: Optional[float]      # None if no record found
    effective_from: Optional[date]
    effective_to: Optional[date]
    plant_id: int
    target_date: date
    message: str


# ---------------------------------------------------------------------------
# 1. Reading Continuity Validator
# ---------------------------------------------------------------------------

def validate_reading_continuity(
    previous_closing: float,
    current_opening: float,
    tolerance: float = 0.0001,
) -> ContinuityCheckResult:
    """
    Strict boolean check: current month's opening reading must equal
    previous month's closing reading.

    BPDB rule: Any discontinuity indicates either a meter replacement,
    a data entry error, or a missed reading and must trigger an alert.

    Parameters
    ----------
    previous_closing : Closing reading from last month's MOD entry.
    current_opening  : Opening reading entered for current month.
    tolerance        : Floating-point epsilon for near-equality check
                       (default 0.0001 kWh — smaller than the least
                       significant digit on any BPDB meter).

    Returns
    -------
    ContinuityCheckResult
    """
    delta = current_opening - previous_closing
    is_valid = abs(delta) <= tolerance

    if is_valid:
        message = "Continuity check passed."
    else:
        direction = "higher" if delta > 0 else "lower"
        message = (
            f"Continuity FAILURE: current opening ({current_opening:.4f}) is "
            f"{direction} than previous closing ({previous_closing:.4f}) "
            f"by {abs(delta):.4f} units. Possible meter replacement or entry error."
        )
        logger.warning(message)

    return ContinuityCheckResult(
        is_valid=is_valid,
        previous_closing=previous_closing,
        current_opening=current_opening,
        delta=round(delta, 6),
        message=message,
    )


def validate_reading_continuity_batch(
    readings: list[dict],
) -> list[ContinuityCheckResult]:
    """
    Validate continuity for multiple meters at once.

    Each item in `readings` must have keys:
        meter_id, previous_closing, current_opening

    Returns a list of ContinuityCheckResult in the same order.
    """
    results = []
    for r in readings:
        result = validate_reading_continuity(
            previous_closing=r["previous_closing"],
            current_opening=r["current_opening"],
        )
        results.append(result)
    return results


# ---------------------------------------------------------------------------
# 2. OMF Value Validator (async — requires DB session)
# ---------------------------------------------------------------------------

async def validate_omf_value(
    plant_id: int,
    target_date: date,
    db_session: AsyncSession,
) -> OMFValidationResult:
    """
    Fetch and validate the active OMF value for a plant on a given date.

    Queries `omf_history` for a record where:
        effective_from <= target_date
    AND (effective_to IS NULL OR effective_to >= target_date)

    Parameters
    ----------
    plant_id    : Plant primary key.
    target_date : The calendar date for which the OMF is needed (typically
                  the first day of the billing month).
    db_session  : Active async SQLAlchemy session.

    Returns
    -------
    OMFValidationResult
        .is_valid  = True if exactly one active record is found.
        .omf_value = The float OMF coefficient, or None if not found.
    """
    # Lazy import to avoid circular imports at module load time
    from app.models.omf_history import OMFHistory  # noqa: PLC0415

    stmt = (
        select(OMFHistory)
        .where(
            and_(
                OMFHistory.plant_id == plant_id,
                OMFHistory.effective_from <= target_date,
                (OMFHistory.effective_to.is_(None)) | (OMFHistory.effective_to >= target_date),
            )
        )
        .order_by(OMFHistory.effective_from.desc())
        .limit(2)   # Fetch up to 2 to detect overlapping records (data integrity issue)
    )

    result = await db_session.execute(stmt)
    records = result.scalars().all()

    if not records:
        msg = (
            f"No OMF record found for plant_id={plant_id} on {target_date}. "
            "Generation cannot be billed without a valid OMF."
        )
        logger.error(msg)
        return OMFValidationResult(
            is_valid=False,
            omf_value=None,
            effective_from=None,
            effective_to=None,
            plant_id=plant_id,
            target_date=target_date,
            message=msg,
        )

    if len(records) > 1:
        msg = (
            f"DATA INTEGRITY WARNING: Multiple active OMF records found for "
            f"plant_id={plant_id} on {target_date}. Using most recent. "
            "Overlapping date ranges must be corrected in master data."
        )
        logger.warning(msg)

    active_record = records[0]
    omf_val = float(active_record.omf_value)

    if not (0.0 < omf_val <= 1.0):
        msg = (
            f"OMF value {omf_val} for plant_id={plant_id} is outside valid "
            "range (0, 1]. Record may be corrupt."
        )
        logger.error(msg)
        return OMFValidationResult(
            is_valid=False,
            omf_value=omf_val,
            effective_from=active_record.effective_from,
            effective_to=active_record.effective_to,
            plant_id=plant_id,
            target_date=target_date,
            message=msg,
        )

    return OMFValidationResult(
        is_valid=True,
        omf_value=omf_val,
        effective_from=active_record.effective_from,
        effective_to=active_record.effective_to,
        plant_id=plant_id,
        target_date=target_date,
        message=(
            f"Valid OMF {omf_val:.4f} ({omf_val * 100:.2f}%) active from "
            f"{active_record.effective_from} to "
            f"{active_record.effective_to or 'present'}."
        ),
    )


# ---------------------------------------------------------------------------
# 3. Meter Reading Range Validator
# ---------------------------------------------------------------------------

def validate_reading_range(
    reading: float,
    meter_number: str,
    max_plausible: float = 99999.9,
) -> tuple[bool, str]:
    """
    Sanity-check a single dial reading value.

    Returns (is_valid, message).
    """
    if reading < 0:
        return False, f"Meter {meter_number}: Reading {reading} is negative."
    if reading > max_plausible:
        return False, (
            f"Meter {meter_number}: Reading {reading} exceeds maximum plausible "
            f"dial value ({max_plausible}). Possible entry error."
        )
    return True, "OK"


# ---------------------------------------------------------------------------
# 4. Month/Year sanity checks
# ---------------------------------------------------------------------------

def validate_month_year(month: int, year: int) -> tuple[bool, str]:
    """Validate calendar month (1-12) and a plausible 4-digit year."""
    if not 1 <= month <= 12:
        return False, f"Invalid month: {month}. Must be 1–12."
    if not 2000 <= year <= 2100:
        return False, f"Implausible year: {year}."
    return True, "OK"
