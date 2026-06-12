"""
GridIntel — BPDB MOD Excel Ingestion Parser
Processes BPDB workbooks containing "Gen-Ind" and "Generation Reading" sheets.
Validates reading continuity before persisting to the database.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import openpyxl
from openpyxl.worksheet.worksheet import Worksheet

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Domain constants
# ---------------------------------------------------------------------------

KNOWN_PLANT_NAMES: dict[str, str] = {
    # Normalized key → canonical name
    "ashuganj": "Ashuganj 225MW",
    "payra": "Payra 1320MW",
    "haripur": "Haripur 412MW CCPP",
    "ghorashal": "Ghorashal 630MW",
    "barapukuria": "Barapukuria 525MW",
    "meghnaghat": "Meghnaghat 450MW",
    "siddhirgonj": "Siddhirgonj 210MW",
    "cumilla": "Cumilla 225MW",
}

METER_TYPE_PATTERNS: dict[str, str] = {
    r"\bgt\b": "GT",       # Gas Turbine
    r"\bst\b": "ST",       # Steam Turbine
    r"\bmain\b": "Main",
    r"\bcheck\b": "Check",
    r"\bcheck\s*meter\b": "Check",
}

MONTH_NAME_MAP: dict[str, int] = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


# ---------------------------------------------------------------------------
# Data Transfer Objects
# ---------------------------------------------------------------------------

@dataclass
class MODReading:
    plant_name: str
    canonical_plant_name: str
    meter_number: str
    meter_type: str
    reading_month: int
    reading_year: int
    multiplier: float          # Meter multiplier (CF raw)
    cf: float                  # Conversion factor
    omf: float                 # Outage multiplier factor
    opening_reading: float     # kWh (active energy opening)
    closing_reading: float     # kWh (active energy closing)
    reactive_opening: float    # kVARh opening
    reactive_closing: float    # kVARh closing
    active_energy_kwh: float   # closing - opening (before CF)
    reactive_energy_kvarh: float
    gross_generation_mu: float  # MU = (active_energy * multiplier * CF) / 1_000_000
    net_generation_mu: float
    station_use_mu: float
    auxiliary_percent: float
    source_sheet: str
    row_number: int
    raw_row: dict[str, Any] = field(default_factory=dict)


@dataclass
class ContinuityWarning:
    plant_name: str
    meter_number: str
    reading_month: int
    reading_year: int
    expected_opening: float     # Previous month's closing reading
    actual_opening: float       # This month's opening reading
    discrepancy: float          # Absolute difference
    message: str


@dataclass
class ParseResult:
    workbook_path: str
    readings: list[MODReading]
    warnings: list[ContinuityWarning]
    skipped_rows: list[dict[str, Any]]
    parse_errors: list[str]
    total_rows_processed: int
    sheets_found: list[str]


# ---------------------------------------------------------------------------
# Worksheet detection helpers
# ---------------------------------------------------------------------------

def _find_sheet(wb: openpyxl.Workbook, patterns: list[str]) -> Optional[Worksheet]:
    """Find a sheet whose name matches any of the given case-insensitive patterns."""
    for name in wb.sheetnames:
        name_lower = name.lower().strip()
        for pat in patterns:
            if pat.lower() in name_lower:
                return wb[name]
    return None


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convert cell value to float, returning default on failure."""
    if value is None:
        return default
    try:
        if isinstance(value, str):
            cleaned = value.strip().replace(",", "").replace(" ", "")
            if cleaned == "" or cleaned == "-":
                return default
            return float(cleaned)
        return float(value)
    except (ValueError, TypeError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    """Convert cell value to int."""
    try:
        return int(_safe_float(value, float(default)))
    except (ValueError, TypeError):
        return default


def _normalize_plant_name(raw: str) -> str:
    """Return canonical plant name from partial match; return raw if no match."""
    raw_lower = raw.lower().strip()
    for key, canonical in KNOWN_PLANT_NAMES.items():
        if key in raw_lower:
            return canonical
    return raw.strip()


def _extract_meter_type(raw: str) -> str:
    raw_lower = raw.lower()
    for pattern, mtype in METER_TYPE_PATTERNS.items():
        if re.search(pattern, raw_lower):
            return mtype
    return "Main"


def _parse_month_year(cell_value: Any) -> tuple[int, int]:
    """
    Parse month/year from a cell that may contain:
     - A datetime object
     - "April 2026" or "Apr-2026" string
     - "04/2026" or "2026-04" string
    Returns (month: int, year: int) or (0, 0) on failure.
    """
    if isinstance(cell_value, datetime):
        return cell_value.month, cell_value.year

    if cell_value is None:
        return 0, 0

    text = str(cell_value).strip()

    # Try "Month Year" e.g. "April 2026"
    match = re.match(r"(\w+)\s+(\d{4})", text, re.IGNORECASE)
    if match:
        month_str = match.group(1).lower()
        year = int(match.group(2))
        month = MONTH_NAME_MAP.get(month_str, 0)
        if month and 2000 <= year <= 2100:
            return month, year

    # Try MM/YYYY or YYYY-MM
    match = re.match(r"(\d{1,2})[/-](\d{4})", text)
    if match:
        return int(match.group(1)), int(match.group(2))

    match = re.match(r"(\d{4})[/-](\d{1,2})", text)
    if match:
        return int(match.group(2)), int(match.group(1))

    return 0, 0


# ---------------------------------------------------------------------------
# Gen-Ind Sheet Parser
# ---------------------------------------------------------------------------

class GenIndSheetParser:
    """
    Parses the "Gen-Ind" (Generation Indicator) sheet.

    Expected column layout (0-indexed, may vary by 1-2 columns):
      Col 0  : Plant Name / Row label
      Col 1  : Meter Number
      Col 2  : Meter Type (GT/ST/Main/Check)
      Col 3  : Multiplier
      Col 4  : CF (Conversion Factor)
      Col 5  : OMF
      Col 6  : Opening Reading (kWh Active)
      Col 7  : Closing Reading (kWh Active)
      Col 8  : Opening Reading (kVARh Reactive)
      Col 9  : Closing Reading (kVARh Reactive)
      Col 10 : Active Energy (kWh diff)
      Col 11 : Reactive Energy (kVARh diff)
      Col 12 : Gross Generation (MU)
      Col 13 : Station Use (MU)
      Col 14 : Net Generation (MU)
      Col 15 : Auxiliary %

    Header row detection: scan first 15 rows for a row containing "plant" or "meter".
    Month/Year: scan first 10 rows for a datetime or "Month Year" string.
    """

    HEADER_KEYWORDS = ["plant", "meter", "multiplier", "opening", "reading"]

    def parse(self, ws: Worksheet) -> list[dict[str, Any]]:
        """Return raw row dicts from the Gen-Ind sheet."""
        header_row_idx, col_map = self._detect_header(ws)
        if header_row_idx is None:
            logger.warning("Gen-Ind: Could not detect header row.")
            return []

        month, year = self._detect_month_year(ws, header_row_idx)
        rows = []
        current_plant = ""

        for row_idx in range(header_row_idx + 1, ws.max_row + 1):
            row_vals = [ws.cell(row=row_idx, column=c).value for c in range(1, ws.max_column + 1)]

            if all(v is None for v in row_vals):
                continue  # blank row

            # Plant name detection: if col 0 has text and meter col is empty, treat as plant header
            col0_val = str(row_vals[0] or "").strip()
            if col0_val and not any(row_vals[1:5]):
                current_plant = col0_val
                continue

            # Extract values using detected column map
            raw = {
                "plant_name": col0_val or current_plant,
                "meter_number": str(row_vals[col_map.get("meter", 1)] or "").strip(),
                "meter_type": str(row_vals[col_map.get("type", 2)] or "").strip(),
                "multiplier": _safe_float(row_vals[col_map.get("multiplier", 3)], 1.0),
                "cf": _safe_float(row_vals[col_map.get("cf", 4)], 1.0),
                "omf": _safe_float(row_vals[col_map.get("omf", 5)], 1.0),
                "opening_reading": _safe_float(row_vals[col_map.get("opening_active", 6)]),
                "closing_reading": _safe_float(row_vals[col_map.get("closing_active", 7)]),
                "reactive_opening": _safe_float(row_vals[col_map.get("opening_reactive", 8)]),
                "reactive_closing": _safe_float(row_vals[col_map.get("closing_reactive", 9)]),
                "gross_generation_mu": _safe_float(row_vals[col_map.get("gross_gen", 12)]),
                "station_use_mu": _safe_float(row_vals[col_map.get("station_use", 13)]),
                "net_generation_mu": _safe_float(row_vals[col_map.get("net_gen", 14)]),
                "auxiliary_percent": _safe_float(row_vals[col_map.get("aux_pct", 15)]),
                "reading_month": month,
                "reading_year": year,
                "source_sheet": "Gen-Ind",
                "row_number": row_idx,
            }

            # Skip rows with no meaningful data
            if not raw["meter_number"] and raw["opening_reading"] == 0.0 and raw["closing_reading"] == 0.0:
                continue

            rows.append(raw)

        return rows

    def _detect_header(self, ws: Worksheet) -> tuple[Optional[int], dict[str, int]]:
        """Scan first 20 rows; return (header_row_index, column_name→0-based-col-index)."""
        for row_idx in range(1, min(21, ws.max_row + 1)):
            row_vals = [str(ws.cell(row=row_idx, column=c).value or "").lower().strip()
                        for c in range(1, ws.max_column + 1)]
            matched = sum(1 for kw in self.HEADER_KEYWORDS if any(kw in v for v in row_vals))
            if matched >= 2:
                col_map = self._build_col_map(row_vals)
                return row_idx, col_map
        return None, {}

    @staticmethod
    def _build_col_map(header_vals: list[str]) -> dict[str, int]:
        """Map semantic column names to 0-based column indices."""
        col_map: dict[str, int] = {}
        for idx, val in enumerate(header_vals):
            if "plant" in val and "meter" not in val:
                col_map.setdefault("plant", idx)
            elif "meter" in val and "number" in val:
                col_map.setdefault("meter", idx)
            elif "type" in val:
                col_map.setdefault("type", idx)
            elif "multiplier" in val or "multi" in val:
                col_map.setdefault("multiplier", idx)
            elif val == "cf" or "conv" in val and "factor" in val:
                col_map.setdefault("cf", idx)
            elif "omf" in val:
                col_map.setdefault("omf", idx)
            elif "opening" in val and "react" not in val and "opening_active" not in col_map:
                col_map.setdefault("opening_active", idx)
            elif "closing" in val and "react" not in val and "closing_active" not in col_map:
                col_map.setdefault("closing_active", idx)
            elif "opening" in val and "react" in val:
                col_map.setdefault("opening_reactive", idx)
            elif "closing" in val and "react" in val:
                col_map.setdefault("closing_reactive", idx)
            elif "gross" in val:
                col_map.setdefault("gross_gen", idx)
            elif "station" in val or "aux" in val and "mu" in val:
                col_map.setdefault("station_use", idx)
            elif "net" in val:
                col_map.setdefault("net_gen", idx)
            elif "%" in val or "percent" in val or "aux" in val:
                col_map.setdefault("aux_pct", idx)
        return col_map

    @staticmethod
    def _detect_month_year(ws: Worksheet, header_row_idx: int) -> tuple[int, int]:
        for row_idx in range(1, header_row_idx + 1):
            for col_idx in range(1, ws.max_column + 1):
                val = ws.cell(row=row_idx, column=col_idx).value
                if val is not None:
                    m, y = _parse_month_year(val)
                    if m and y:
                        return m, y
        return 0, 0


# ---------------------------------------------------------------------------
# Generation Reading Sheet Parser
# ---------------------------------------------------------------------------

class GenerationReadingSheetParser:
    """
    Parses the "Generation Reading" sheet.

    This sheet typically has a more structured format with merged cells for plant headers
    and explicit sub-rows for each meter (including GT/ST breakdown for CCPP plants).

    Expected structure (approximate):
      Row 1-5   : Title, Month/Year metadata
      Row 6+    : Data rows

    Column layout (detected dynamically):
      Plant Name | Meter No | Meter Type | CF | OMF | Opening Active | Closing Active |
      Opening Reactive | Closing Reactive | Active Energy MU | Reactive Energy MVAR |
      Gross Gen MU | Station Use MU | Net Gen MU | Aux %
    """

    HEADER_KEYWORDS = ["sl", "plant", "meter", "cf", "omf", "active", "reactive", "generation"]

    def parse(self, ws: Worksheet) -> list[dict[str, Any]]:
        header_row_idx, col_map = self._detect_header(ws)
        if header_row_idx is None:
            logger.warning("Generation Reading: Could not detect header row.")
            return []

        month, year = GenIndSheetParser._detect_month_year(ws, header_row_idx)
        rows = []
        current_plant = ""

        for row_idx in range(header_row_idx + 1, ws.max_row + 1):
            row_vals = [ws.cell(row=row_idx, column=c).value for c in range(1, ws.max_column + 1)]

            if all(v is None for v in row_vals):
                continue

            col0_val = str(row_vals[0] or "").strip()

            # Detect plant name rows (Merged cell with plant name only)
            if col0_val and _normalize_plant_name(col0_val) in KNOWN_PLANT_NAMES.values():
                current_plant = col0_val
                continue

            # Try extracting plant from col0 if it has a known keyword
            if col0_val and any(kw in col0_val.lower() for kw in KNOWN_PLANT_NAMES.keys()):
                current_plant = col0_val

            raw = {
                "plant_name": current_plant or col0_val,
                "meter_number": str(row_vals[col_map.get("meter", 1)] or "").strip(),
                "meter_type": str(row_vals[col_map.get("type", 2)] or "Main").strip(),
                "cf": _safe_float(row_vals[col_map.get("cf", 3)], 1.0),
                "omf": _safe_float(row_vals[col_map.get("omf", 4)], 1.0),
                "multiplier": _safe_float(row_vals[col_map.get("multiplier", 5)], 1.0),
                "opening_reading": _safe_float(row_vals[col_map.get("opening_active", 5)]),
                "closing_reading": _safe_float(row_vals[col_map.get("closing_active", 6)]),
                "reactive_opening": _safe_float(row_vals[col_map.get("opening_reactive", 7)]),
                "reactive_closing": _safe_float(row_vals[col_map.get("closing_reactive", 8)]),
                "gross_generation_mu": _safe_float(row_vals[col_map.get("gross_gen", 11)]),
                "station_use_mu": _safe_float(row_vals[col_map.get("station_use", 12)]),
                "net_generation_mu": _safe_float(row_vals[col_map.get("net_gen", 13)]),
                "auxiliary_percent": _safe_float(row_vals[col_map.get("aux_pct", 14)]),
                "reading_month": month,
                "reading_year": year,
                "source_sheet": "Generation Reading",
                "row_number": row_idx,
            }

            if not raw["meter_number"] and raw["opening_reading"] == 0.0:
                continue

            rows.append(raw)

        return rows

    def _detect_header(self, ws: Worksheet) -> tuple[Optional[int], dict[str, int]]:
        for row_idx in range(1, min(25, ws.max_row + 1)):
            row_vals = [str(ws.cell(row=row_idx, column=c).value or "").lower().strip()
                        for c in range(1, ws.max_column + 1)]
            matched = sum(1 for kw in self.HEADER_KEYWORDS if any(kw in v for v in row_vals))
            if matched >= 3:
                col_map = GenIndSheetParser._build_col_map(row_vals)
                return row_idx, col_map
        return None, {}


# ---------------------------------------------------------------------------
# Continuity Validator
# ---------------------------------------------------------------------------

class ReadingContinuityValidator:
    """
    Validates that the opening reading of the current month matches
    the closing reading of the previous month.

    Tolerance: ±0.001 kWh (floating point rounding allowance).
    """

    TOLERANCE = 0.001  # kWh

    def validate(
        self,
        current_readings: list[MODReading],
        previous_readings: list[MODReading],
    ) -> list[ContinuityWarning]:
        warnings: list[ContinuityWarning] = []

        # Build lookup: (canonical_plant, meter_number) → closing_reading
        prev_index: dict[tuple[str, str], float] = {
            (r.canonical_plant_name, r.meter_number): r.closing_reading
            for r in previous_readings
        }

        for reading in current_readings:
            key = (reading.canonical_plant_name, reading.meter_number)
            if key not in prev_index:
                continue  # No previous month data; skip continuity check

            expected_opening = prev_index[key]
            discrepancy = abs(reading.opening_reading - expected_opening)

            if discrepancy > self.TOLERANCE:
                msg = (
                    f"CONTINUITY BREAK — Plant: {reading.canonical_plant_name} | "
                    f"Meter: {reading.meter_number} | "
                    f"Month: {reading.reading_month}/{reading.reading_year}\n"
                    f"  Expected opening reading : {expected_opening:,.3f} kWh "
                    f"(previous month closing)\n"
                    f"  Actual opening reading   : {reading.opening_reading:,.3f} kWh\n"
                    f"  Discrepancy              : {discrepancy:,.3f} kWh\n"
                    f"  ⚠ Data entry error or missing month detected. "
                    f"Please verify before submitting."
                )
                logger.warning(msg)
                warnings.append(
                    ContinuityWarning(
                        plant_name=reading.canonical_plant_name,
                        meter_number=reading.meter_number,
                        reading_month=reading.reading_month,
                        reading_year=reading.reading_year,
                        expected_opening=expected_opening,
                        actual_opening=reading.opening_reading,
                        discrepancy=discrepancy,
                        message=msg,
                    )
                )

        return warnings


# ---------------------------------------------------------------------------
# Reading Calculator
# ---------------------------------------------------------------------------

class ReadingCalculator:
    """
    Computes derived fields from raw meter readings.
    All formulas follow BPDB standard energy accounting methodology.
    """

    @staticmethod
    def calculate(raw: dict[str, Any]) -> dict[str, Any]:
        opening = raw.get("opening_reading", 0.0)
        closing = raw.get("closing_reading", 0.0)
        r_opening = raw.get("reactive_opening", 0.0)
        r_closing = raw.get("reactive_closing", 0.0)
        multiplier = raw.get("multiplier", 1.0)
        cf = raw.get("cf", 1.0)
        omf = raw.get("omf", 1.0)

        # Handle meter rollover (assuming max rollover at 9,999,999.999 kWh)
        MAX_ROLLOVER = 9_999_999.999
        if closing < opening:
            active_energy_kwh = (MAX_ROLLOVER - opening) + closing
            logger.info(
                "Meter rollover detected for %s meter %s: opening=%.3f closing=%.3f",
                raw.get("plant_name"), raw.get("meter_number"), opening, closing,
            )
        else:
            active_energy_kwh = closing - opening

        if r_closing < r_opening:
            reactive_energy_kvarh = (MAX_ROLLOVER - r_opening) + r_closing
        else:
            reactive_energy_kvarh = r_closing - r_opening

        # Generation in MU (Million Units = MWh / 1000)
        # Formula: Gross Gen MU = (Active Energy kWh × Multiplier × CF) / 1,000,000
        gross_generation_kwh = active_energy_kwh * multiplier * cf
        gross_generation_mu = gross_generation_kwh / 1_000_000.0

        # Apply OMF (Outage Multiplier Factor) — adjusts for metering period outages
        # Net Gross after OMF = Gross × OMF  (OMF ≤ 1.0 reduces, > 1.0 for compensation)
        gross_generation_mu_omf = gross_generation_mu * omf

        # If sheet already has station_use and net_gen, use those; else estimate
        station_use_mu = raw.get("station_use_mu", 0.0)
        net_generation_mu = raw.get("net_generation_mu", 0.0)

        # Recalculate if values are zero/missing
        if station_use_mu == 0.0 and net_generation_mu == 0.0:
            # Standard auxiliary consumption: 5.5% for gas, 7% for coal (approximation)
            aux_rate = 0.055
            station_use_mu = gross_generation_mu_omf * aux_rate
            net_generation_mu = gross_generation_mu_omf - station_use_mu

        auxiliary_percent = (
            (station_use_mu / gross_generation_mu_omf * 100.0)
            if gross_generation_mu_omf > 0
            else 0.0
        )

        return {
            **raw,
            "active_energy_kwh": round(active_energy_kwh, 3),
            "reactive_energy_kvarh": round(reactive_energy_kvarh, 3),
            "gross_generation_mu": round(gross_generation_mu_omf, 6),
            "station_use_mu": round(station_use_mu, 6),
            "net_generation_mu": round(net_generation_mu, 6),
            "auxiliary_percent": round(auxiliary_percent, 3),
        }


# ---------------------------------------------------------------------------
# Main Parser: BPDBMODParser
# ---------------------------------------------------------------------------

class BPDBMODParser:
    """
    Top-level BPDB MOD Excel workbook parser.

    Handles workbooks containing:
      - "Gen-Ind" sheet (Generation Indicator)
      - "Generation Reading" sheet

    Usage:
        parser = BPDBMODParser()
        result = parser.parse(
            file_path="BPDB_MOD_April_2026.xlsx",
            previous_readings=prior_month_readings,  # list[MODReading] from DB
        )
        if result.warnings:
            for w in result.warnings:
                print(w.message)
        for reading in result.readings:
            # persist to database
    """

    def __init__(self) -> None:
        self._gen_ind_parser = GenIndSheetParser()
        self._gen_reading_parser = GenerationReadingSheetParser()
        self._continuity_validator = ReadingContinuityValidator()
        self._calculator = ReadingCalculator()

    def parse(
        self,
        file_path: str | Path,
        previous_readings: Optional[list[MODReading]] = None,
    ) -> ParseResult:
        file_path = Path(file_path)
        parse_errors: list[str] = []
        skipped_rows: list[dict[str, Any]] = []
        sheets_found: list[str] = []
        all_raw_rows: list[dict[str, Any]] = []

        # ------------------------------------------------------------------
        # Open workbook
        # ------------------------------------------------------------------
        try:
            wb = openpyxl.load_workbook(file_path, data_only=True)
        except Exception as exc:
            return ParseResult(
                workbook_path=str(file_path),
                readings=[],
                warnings=[],
                skipped_rows=[],
                parse_errors=[f"Failed to open workbook: {exc}"],
                total_rows_processed=0,
                sheets_found=[],
            )

        # ------------------------------------------------------------------
        # Locate sheets
        # ------------------------------------------------------------------
        gen_ind_ws = _find_sheet(wb, ["gen-ind", "gen_ind", "genind", "indicator"])
        gen_reading_ws = _find_sheet(wb, ["generation reading", "gen reading", "gen_reading"])

        if gen_ind_ws:
            sheets_found.append(gen_ind_ws.title)
            try:
                rows = self._gen_ind_parser.parse(gen_ind_ws)
                all_raw_rows.extend(rows)
                logger.info("Gen-Ind sheet: parsed %d rows.", len(rows))
            except Exception as exc:
                parse_errors.append(f"Gen-Ind sheet error: {exc}")

        if gen_reading_ws:
            sheets_found.append(gen_reading_ws.title)
            try:
                rows = self._gen_reading_parser.parse(gen_reading_ws)
                all_raw_rows.extend(rows)
                logger.info("Generation Reading sheet: parsed %d rows.", len(rows))
            except Exception as exc:
                parse_errors.append(f"Generation Reading sheet error: {exc}")

        if not gen_ind_ws and not gen_reading_ws:
            parse_errors.append(
                f"Neither 'Gen-Ind' nor 'Generation Reading' sheet found. "
                f"Available sheets: {wb.sheetnames}"
            )
            return ParseResult(
                workbook_path=str(file_path),
                readings=[],
                warnings=[],
                skipped_rows=[],
                parse_errors=parse_errors,
                total_rows_processed=0,
                sheets_found=[],
            )

        # ------------------------------------------------------------------
        # Transform raw rows to MODReading objects
        # ------------------------------------------------------------------
        readings: list[MODReading] = []
        for raw in all_raw_rows:
            try:
                calculated = self._calculator.calculate(raw)
                plant_raw = calculated.get("plant_name", "")
                canonical = _normalize_plant_name(plant_raw)
                meter_type = _extract_meter_type(calculated.get("meter_type", ""))

                reading = MODReading(
                    plant_name=plant_raw,
                    canonical_plant_name=canonical,
                    meter_number=calculated.get("meter_number", "UNKNOWN"),
                    meter_type=meter_type,
                    reading_month=calculated.get("reading_month", 0),
                    reading_year=calculated.get("reading_year", 0),
                    multiplier=calculated.get("multiplier", 1.0),
                    cf=calculated.get("cf", 1.0),
                    omf=calculated.get("omf", 1.0),
                    opening_reading=calculated.get("opening_reading", 0.0),
                    closing_reading=calculated.get("closing_reading", 0.0),
                    reactive_opening=calculated.get("reactive_opening", 0.0),
                    reactive_closing=calculated.get("reactive_closing", 0.0),
                    active_energy_kwh=calculated.get("active_energy_kwh", 0.0),
                    reactive_energy_kvarh=calculated.get("reactive_energy_kvarh", 0.0),
                    gross_generation_mu=calculated.get("gross_generation_mu", 0.0),
                    net_generation_mu=calculated.get("net_generation_mu", 0.0),
                    station_use_mu=calculated.get("station_use_mu", 0.0),
                    auxiliary_percent=calculated.get("auxiliary_percent", 0.0),
                    source_sheet=calculated.get("source_sheet", "Unknown"),
                    row_number=calculated.get("row_number", 0),
                    raw_row=raw,
                )

                # Basic validation
                if reading.reading_month == 0 or reading.reading_year == 0:
                    skipped_rows.append({
                        **raw,
                        "skip_reason": "Missing month/year metadata",
                    })
                    continue

                if reading.closing_reading < reading.opening_reading:
                    # Only valid if it's a rollover; already handled in calculator
                    # Log for audit purposes
                    logger.info(
                        "Meter rollover at row %d: plant=%s meter=%s",
                        raw.get("row_number"), canonical, reading.meter_number,
                    )

                readings.append(reading)

            except Exception as exc:
                skipped_rows.append({**raw, "skip_reason": str(exc)})
                parse_errors.append(f"Row {raw.get('row_number', '?')}: {exc}")

        # ------------------------------------------------------------------
        # Continuity validation
        # ------------------------------------------------------------------
        warnings: list[ContinuityWarning] = []
        if previous_readings:
            warnings = self._continuity_validator.validate(readings, previous_readings)
            if warnings:
                logger.warning(
                    "=== CONTINUITY CHECK FAILED: %d break(s) detected ===",
                    len(warnings),
                )
                for w in warnings:
                    # Print explicit warning block to stdout/logs
                    border = "=" * 80
                    print(f"\n{border}")
                    print("⚠  BPDB MOD PARSER — READING CONTINUITY WARNING")
                    print(border)
                    print(w.message)
                    print(border)

        logger.info(
            "Parse complete: %d readings, %d warnings, %d skipped, %d errors.",
            len(readings), len(warnings), len(skipped_rows), len(parse_errors),
        )

        return ParseResult(
            workbook_path=str(file_path),
            readings=readings,
            warnings=warnings,
            skipped_rows=skipped_rows,
            parse_errors=parse_errors,
            total_rows_processed=len(all_raw_rows),
            sheets_found=sheets_found,
        )

    # ------------------------------------------------------------------
    # Convenience: convert ParseResult to database-ready dicts
    # ------------------------------------------------------------------

    @staticmethod
    def to_db_dicts(result: ParseResult) -> list[dict[str, Any]]:
        """Convert MODReading objects to dicts suitable for SQLAlchemy bulk insert."""
        records = []
        for r in result.readings:
            records.append({
                "plant_canonical_name": r.canonical_plant_name,
                "meter_number": r.meter_number,
                "meter_type": r.meter_type,
                "reading_month": r.reading_month,
                "reading_year": r.reading_year,
                "multiplier": r.multiplier,
                "cf": r.cf,
                "omf": r.omf,
                "opening_reading": r.opening_reading,
                "closing_reading": r.closing_reading,
                "reactive_opening": r.reactive_opening,
                "reactive_closing": r.reactive_closing,
                "active_energy_kwh": r.active_energy_kwh,
                "reactive_energy_kvarh": r.reactive_energy_kvarh,
                "gross_generation_mu": r.gross_generation_mu,
                "station_use_mu": r.station_use_mu,
                "net_generation_mu": r.net_generation_mu,
                "auxiliary_percent": r.auxiliary_percent,
                "source_sheet": r.source_sheet,
                "status": "draft",
            })
        return records


# ---------------------------------------------------------------------------
# CLI entry point for standalone testing
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    import json as _json

    if len(sys.argv) < 2:
        print("Usage: python bpdb_mod_parser.py <path_to_excel_file.xlsx>")
        sys.exit(1)

    logging.basicConfig(level=logging.INFO)
    parser = BPDBMODParser()
    result = parser.parse(sys.argv[1])

    print(f"\n{'=' * 60}")
    print(f"File          : {result.workbook_path}")
    print(f"Sheets found  : {result.sheets_found}")
    print(f"Total rows    : {result.total_rows_processed}")
    print(f"Valid readings: {len(result.readings)}")
    print(f"Warnings      : {len(result.warnings)}")
    print(f"Skipped rows  : {len(result.skipped_rows)}")
    print(f"Errors        : {len(result.parse_errors)}")
    print(f"{'=' * 60}\n")

    if result.parse_errors:
        print("PARSE ERRORS:")
        for e in result.parse_errors:
            print(f"  - {e}")

    if result.readings:
        print("\nSAMPLE READING (first record):")
        r = result.readings[0]
        print(_json.dumps(
            {
                "plant": r.canonical_plant_name,
                "meter": r.meter_number,
                "type": r.meter_type,
                "month_year": f"{r.reading_month}/{r.reading_year}",
                "opening": r.opening_reading,
                "closing": r.closing_reading,
                "gross_mu": r.gross_generation_mu,
                "net_mu": r.net_generation_mu,
                "aux_pct": r.auxiliary_percent,
            },
            indent=2,
        ))
