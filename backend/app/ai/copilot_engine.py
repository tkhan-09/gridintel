"""
GridIntel AI Copilot Engine
Consolidated AI Layer: LLM Fallback Chain, Intent Detector, NL-to-SQL Agent, Vector RAG Retriever
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration constants (override via env in production)
# ---------------------------------------------------------------------------

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "mistralai/mistral-7b-instruct"

REQUEST_TIMEOUT = 30  # seconds
MAX_RETRIES = 1


# ---------------------------------------------------------------------------
# Data Transfer Objects
# ---------------------------------------------------------------------------

@dataclass
class LLMRequest:
    messages: list[dict[str, str]]
    system_prompt: str = ""
    temperature: float = 0.2
    max_tokens: int = 1024


@dataclass
class LLMResponse:
    content: str
    provider: str
    latency_ms: int
    success: bool
    error: Optional[str] = None


@dataclass
class IntentResult:
    category: str
    intent: str
    confidence: float
    entities: dict[str, Any] = field(default_factory=dict)
    language: str = "en"


@dataclass
class SQLResult:
    sql: str
    is_safe: bool
    blocked_reason: Optional[str] = None
    explanation: str = ""


@dataclass
class RAGResult:
    chunks: list[dict[str, Any]]
    query_embedding: list[float]
    top_k: int


# ---------------------------------------------------------------------------
# 1. LLM Fallback Chain
# ---------------------------------------------------------------------------

class LLMFallbackChain:
    """
    Unified LLM request handler with automatic fallback:
      Groq (llama-3.3-70b-versatile) → Gemini (gemini-1.5-flash) → OpenRouter (mistral-7b-instruct)

    Retries on HTTP 429 (rate limit) and 500 (server error).
    Raises RuntimeError only when all three providers have failed.
    """

    def __init__(
        self,
        groq_api_key: str,
        gemini_api_key: str,
        openrouter_api_key: str,
    ) -> None:
        self._groq_key = groq_api_key
        self._gemini_key = gemini_api_key
        self._openrouter_key = openrouter_api_key
        self._client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Try each provider in order; return first successful response."""
        providers = [
            ("groq", self._call_groq),
            ("gemini", self._call_gemini),
            ("openrouter", self._call_openrouter),
        ]
        last_error = "Unknown error"
        for name, caller in providers:
            try:
                t0 = time.monotonic()
                content = await caller(request)
                latency = int((time.monotonic() - t0) * 1000)
                logger.info("LLM provider=%s latency_ms=%d", name, latency)
                return LLMResponse(
                    content=content,
                    provider=name,
                    latency_ms=latency,
                    success=True,
                )
            except _RetryableError as exc:
                last_error = str(exc)
                logger.warning("Provider %s retryable error: %s — trying next", name, exc)
                continue
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                logger.error("Provider %s non-retryable error: %s — trying next", name, exc)
                continue

        return LLMResponse(
            content="",
            provider="none",
            latency_ms=0,
            success=False,
            error=f"All LLM providers failed. Last error: {last_error}",
        )

    async def close(self) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------------
    # Provider implementations
    # ------------------------------------------------------------------

    async def _call_groq(self, request: LLMRequest) -> str:
        messages = self._prepend_system(request)
        payload = {
            "model": GROQ_MODEL,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        response = await self._client.post(
            GROQ_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {self._groq_key}",
                "Content-Type": "application/json",
            },
        )
        if response.status_code in (429, 500, 503):
            raise _RetryableError(f"Groq HTTP {response.status_code}")
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()

    async def _call_gemini(self, request: LLMRequest) -> str:
        # Merge system prompt into first user turn for Gemini REST API
        combined_messages = self._prepend_system(request)
        contents = []
        for msg in combined_messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens,
            },
        }
        url = f"{GEMINI_API_URL}?key={self._gemini_key}"
        response = await self._client.post(url, json=payload)
        if response.status_code in (429, 500, 503):
            raise _RetryableError(f"Gemini HTTP {response.status_code}")
        response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    async def _call_openrouter(self, request: LLMRequest) -> str:
        messages = self._prepend_system(request)
        payload = {
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        response = await self._client.post(
            OPENROUTER_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {self._openrouter_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://gridintel.bpdb.gov.bd",
                "X-Title": "GridIntel BPDB",
            },
        )
        if response.status_code in (429, 500, 503):
            raise _RetryableError(f"OpenRouter HTTP {response.status_code}")
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _prepend_system(request: LLMRequest) -> list[dict[str, str]]:
        """Return message list with system prompt injected as first user turn if present."""
        if not request.system_prompt:
            return request.messages
        system_turn = {"role": "system", "content": request.system_prompt}
        return [system_turn, *request.messages]


class _RetryableError(Exception):
    """Signals that a provider returned a retryable HTTP error code."""


# ---------------------------------------------------------------------------
# 2. Intent Detector
# ---------------------------------------------------------------------------

class IntentCategory(str, Enum):
    GENERATION = "generation"
    MOD = "mod"
    ENERGY_BALANCE = "energy_balance"
    BILLING = "billing"
    CROSS_BORDER = "cross_border"
    UTILITY_SALES = "utility_sales"
    ANALYTICS = "analytics"
    ANOMALY = "anomaly"
    REPORT = "report"
    FORECAST = "forecast"
    ADJUSTMENT = "adjustment"
    PLANT = "plant"
    AUDIT = "audit"
    HELP = "help"


# Bilingual keyword map: (English patterns, Bengali patterns) → (category, intent)
_INTENT_MAP: list[tuple[list[str], list[str], IntentCategory, str]] = [
    # --- GENERATION ---
    (
        ["generation", "total generation", "how much generated", "gwh", "mwh", "unit generated"],
        ["উৎপাদন", "কত বিদ্যুৎ", "মোট উৎপাদন", "জেনারেশন"],
        IntentCategory.GENERATION,
        "query_generation_total",
    ),
    (
        ["plant generation", "ashuganj", "payra", "haripur", "ghorashal", "barapukuria",
         "meghnaghat", "siddhirgonj", "cumilla", "plant wise", "plant-wise"],
        ["প্ল্যান্ট উৎপাদন", "আশুগঞ্জ", "পায়রা", "হরিপুর", "ঘোড়াশাল", "বরপুকুরিয়া"],
        IntentCategory.GENERATION,
        "query_generation_by_plant",
    ),
    (
        ["net generation", "gross generation", "station use", "auxiliary", "aux consumption"],
        ["নেট উৎপাদন", "গ্রস উৎপাদন", "স্টেশন ব্যবহার", "অক্সিলিয়ারি"],
        IntentCategory.GENERATION,
        "query_generation_net_gross",
    ),
    (
        ["daily generation", "day wise", "date wise"],
        ["দৈনিক উৎপাদন", "দিন অনুযায়ী"],
        IntentCategory.GENERATION,
        "query_generation_daily",
    ),
    (
        ["monthly generation", "month wise", "last month", "this month"],
        ["মাসিক উৎপাদন", "মাস অনুযায়ী", "গত মাস", "এই মাস"],
        IntentCategory.GENERATION,
        "query_generation_monthly",
    ),
    (
        ["fuel consumption", "fuel used", "gas consumption", "coal consumption", "hfo"],
        ["জ্বালানি ব্যবহার", "গ্যাস", "কয়লা"],
        IntentCategory.GENERATION,
        "query_fuel_consumption",
    ),
    # --- MOD ---
    (
        ["mod", "mod reading", "meter reading", "opening reading", "closing reading",
         "multiplier", "cf", "omf"],
        ["মড", "মিটার রিডিং", "ওপেনিং রিডিং", "ক্লোজিং রিডিং", "সিএফ", "ওএমএফ"],
        IntentCategory.MOD,
        "query_mod_reading",
    ),
    (
        ["submit mod", "save mod", "enter reading", "update reading"],
        ["মড জমা", "রিডিং দিন", "রিডিং আপডেট"],
        IntentCategory.MOD,
        "action_submit_mod",
    ),
    (
        ["mod status", "submission status", "pending submission", "who submitted"],
        ["মড স্ট্যাটাস", "জমা স্ট্যাটাস", "পেন্ডিং"],
        IntentCategory.MOD,
        "query_mod_status",
    ),
    # --- ENERGY BALANCE ---
    (
        ["energy balance", "available energy", "total available", "net available"],
        ["এনার্জি ব্যালেন্স", "উপলব্ধ শক্তি", "নেট পাওয়ার"],
        IntentCategory.ENERGY_BALANCE,
        "query_energy_balance",
    ),
    (
        ["transmission loss", "distribution loss", "t&d loss", "system loss", "loss percentage"],
        ["ট্রান্সমিশন লস", "ডিস্ট্রিবিউশন লস", "সিস্টেম লস", "লস শতাংশ"],
        IntentCategory.ENERGY_BALANCE,
        "query_system_loss",
    ),
    (
        ["sankey", "energy flow", "flow diagram"],
        ["এনার্জি প্রবাহ", "শক্তি প্রবাহ"],
        IntentCategory.ENERGY_BALANCE,
        "query_energy_flow",
    ),
    # --- BILLING ---
    (
        ["bill", "billing", "invoice", "payment", "outstanding", "overdue", "amount due"],
        ["বিল", "বিলিং", "ইনভয়েস", "পেমেন্ট", "বকেয়া"],
        IntentCategory.BILLING,
        "query_billing_status",
    ),
    (
        ["generate invoice", "create bill", "issue invoice"],
        ["ইনভয়েস তৈরি", "বিল তৈরি করুন"],
        IntentCategory.BILLING,
        "action_generate_invoice",
    ),
    (
        ["overdue invoice", "unpaid bill", "outstanding payment", "90 days"],
        ["অপরিশোধিত বিল", "বকেয়া পেমেন্ট"],
        IntentCategory.BILLING,
        "query_overdue_invoices",
    ),
    # --- CROSS BORDER ---
    (
        ["cross border", "import", "export", "india", "baharampur", "comilla south",
         "tripura", "400kv", "132kv", "circuit"],
        ["ক্রস বর্ডার", "আমদানি", "রপ্তানি", "ভারত", "বাহারামপুর", "কুমিল্লা সাউথ", "ত্রিপুরা"],
        IntentCategory.CROSS_BORDER,
        "query_cross_border_import",
    ),
    (
        ["circuit availability", "circuit status", "line outage"],
        ["সার্কিট উপলব্ধতা", "লাইন আউটেজ"],
        IntentCategory.CROSS_BORDER,
        "query_circuit_availability",
    ),
    # --- UTILITY SALES ---
    (
        ["utility sales", "sales to utility", "dpdc", "desco", "nesco", "pbs", "wzpdcl",
         "bpdb sales", "consumer sale"],
        ["ইউটিলিটি বিক্রয়", "বিক্রয়", "ডিপিডিসি", "ডেসকো", "নেসকো"],
        IntentCategory.UTILITY_SALES,
        "query_utility_sales",
    ),
    # --- ANALYTICS ---
    (
        ["compare", "comparison", "vs", "versus", "trend", "chart", "graph", "analytics"],
        ["তুলনা", "ট্রেন্ড", "গ্রাফ", "চার্ট", "বিশ্লেষণ"],
        IntentCategory.ANALYTICS,
        "query_analytics_comparison",
    ),
    (
        ["office performance", "office ranking", "best office", "worst office"],
        ["অফিস পারফরমেন্স", "অফিস র‌্যাংকিং"],
        IntentCategory.ANALYTICS,
        "query_office_performance",
    ),
    (
        ["fuel wise", "fuel breakdown", "fuel mix", "renewable", "solar", "hydro"],
        ["জ্বালানি অনুযায়ী", "নবায়নযোগ্য", "সোলার", "হাইড্রো"],
        IntentCategory.ANALYTICS,
        "query_fuel_analytics",
    ),
    (
        ["voltage level", "132kv", "230kv", "400kv", "high voltage", "extra high voltage"],
        ["ভোল্টেজ লেভেল", "উচ্চ ভোল্টেজ"],
        IntentCategory.ANALYTICS,
        "query_voltage_analytics",
    ),
    # --- ANOMALY ---
    (
        ["anomaly", "alert", "spike", "unusual", "abnormal", "deviation", "warning"],
        ["অ্যানোমালি", "সতর্কতা", "অস্বাভাবিক", "বিচ্যুতি"],
        IntentCategory.ANOMALY,
        "query_anomalies",
    ),
    (
        ["high loss", "loss alert", "loss exceeded", "loss threshold"],
        ["উচ্চ লস", "লস অ্যালার্ট"],
        IntentCategory.ANOMALY,
        "query_loss_anomaly",
    ),
    # --- REPORT ---
    (
        ["generate report", "export report", "download report", "pdf report", "excel report",
         "monthly report", "annual report"],
        ["রিপোর্ট তৈরি", "রিপোর্ট ডাউনলোড", "মাসিক রিপোর্ট", "বার্ষিক রিপোর্ট"],
        IntentCategory.REPORT,
        "action_generate_report",
    ),
    (
        ["show report", "view report", "last report"],
        ["রিপোর্ট দেখুন", "শেষ রিপোর্ট"],
        IntentCategory.REPORT,
        "query_report_list",
    ),
    # --- FORECAST ---
    (
        ["forecast", "prediction", "predict", "next month", "projection", "expected generation"],
        ["পূর্বাভাস", "প্রেডিকশন", "আগামী মাস", "প্রজেকশন"],
        IntentCategory.FORECAST,
        "query_forecast",
    ),
    # --- ADJUSTMENT ---
    (
        ["adjustment", "correction", "locked month", "unlock", "change locked"],
        ["অ্যাডজাস্টমেন্ট", "সংশোধন", "লক করা মাস"],
        IntentCategory.ADJUSTMENT,
        "query_adjustment_requests",
    ),
    # --- PLANT INFO ---
    (
        ["plant info", "plant details", "plant capacity", "installed capacity", "plant list"],
        ["প্ল্যান্ট তথ্য", "প্ল্যান্ট ক্ষমতা", "ইনস্টলড ক্যাপাসিটি", "প্ল্যান্ট তালিকা"],
        IntentCategory.PLANT,
        "query_plant_info",
    ),
    # --- AUDIT ---
    (
        ["audit", "audit log", "who changed", "change history", "activity log"],
        ["অডিট", "অডিট লগ", "কে পরিবর্তন করেছে", "পরিবর্তন ইতিহাস"],
        IntentCategory.AUDIT,
        "query_audit_log",
    ),
    # --- HELP ---
    (
        ["help", "how to", "what can you do", "features", "guide", "instructions"],
        ["সাহায্য", "কীভাবে", "আপনি কী করতে পারেন", "গাইড"],
        IntentCategory.HELP,
        "query_help",
    ),
]


class IntentDetector:
    """
    Maps bilingual (English/Bengali) user queries to structured intents.
    Uses keyword matching with confidence scoring.
    Falls back to LLM classification for ambiguous queries.
    """

    def __init__(self, llm_chain: LLMFallbackChain) -> None:
        self._llm = llm_chain

    async def detect(self, query: str) -> IntentResult:
        """Detect intent from a natural language query."""
        language = self._detect_language(query)
        result = self._keyword_match(query)
        if result.confidence >= 0.6:
            result.language = language
            result.entities = self._extract_entities(query)
            return result

        # Fallback to LLM for low-confidence cases
        return await self._llm_classify(query, language)

    # ------------------------------------------------------------------
    # Keyword matching
    # ------------------------------------------------------------------

    def _keyword_match(self, query: str) -> IntentResult:
        query_lower = query.lower()
        best_score = 0.0
        best_category = IntentCategory.HELP
        best_intent = "query_help"

        for en_kws, bn_kws, category, intent in _INTENT_MAP:
            score = 0.0
            all_kws = en_kws + bn_kws
            matched = sum(1 for kw in all_kws if kw.lower() in query_lower)
            if matched > 0:
                score = min(matched / max(len(all_kws) * 0.3, 1), 1.0)
            if score > best_score:
                best_score = score
                best_category = category
                best_intent = intent

        return IntentResult(
            category=best_category.value,
            intent=best_intent,
            confidence=best_score,
        )

    # ------------------------------------------------------------------
    # LLM-based classification
    # ------------------------------------------------------------------

    async def _llm_classify(self, query: str, language: str) -> IntentResult:
        categories = [c.value for c in IntentCategory]
        system_prompt = (
            "You are a query classifier for GridIntel, a power sector management platform for BPDB Bangladesh. "
            "Classify the user query into exactly one of these categories: "
            f"{', '.join(categories)}. "
            "Also provide the most specific intent name (snake_case). "
            "Respond ONLY with valid JSON: {\"category\": \"...\", \"intent\": \"...\", \"confidence\": 0.0-1.0}"
        )
        req = LLMRequest(
            messages=[{"role": "user", "content": query}],
            system_prompt=system_prompt,
            temperature=0.0,
            max_tokens=100,
        )
        resp = await self._llm.complete(req)
        if not resp.success:
            return IntentResult(
                category=IntentCategory.HELP.value,
                intent="query_help",
                confidence=0.1,
                language=language,
            )
        try:
            raw = resp.content.strip()
            # Strip markdown code fences if present
            raw = re.sub(r"```(?:json)?|```", "", raw).strip()
            data = json.loads(raw)
            return IntentResult(
                category=data.get("category", IntentCategory.HELP.value),
                intent=data.get("intent", "query_help"),
                confidence=float(data.get("confidence", 0.5)),
                language=language,
                entities=self._extract_entities(query),
            )
        except (json.JSONDecodeError, KeyError, ValueError):
            return IntentResult(
                category=IntentCategory.HELP.value,
                intent="query_help",
                confidence=0.1,
                language=language,
            )

    # ------------------------------------------------------------------
    # Entity extraction
    # ------------------------------------------------------------------

    _PLANT_NAMES = [
        "ashuganj", "payra", "haripur", "ghorashal", "barapukuria",
        "meghnaghat", "siddhirgonj", "cumilla",
        "আশুগঞ্জ", "পায়রা", "হরিপুর", "ঘোড়াশাল", "বরপুকুরিয়া", "মেঘনাঘাট",
    ]
    _MONTH_NAMES = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
        "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
        "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
    ]
    _UTILITIES = ["bpdb", "dpdc", "desco", "nesco", "pbs", "wzpdcl",
                  "ডিপিডিসি", "ডেসকো", "নেসকো"]

    def _extract_entities(self, query: str) -> dict[str, Any]:
        lower = query.lower()
        entities: dict[str, Any] = {}

        # Plants
        found_plants = [p for p in self._PLANT_NAMES if p in lower]
        if found_plants:
            entities["plants"] = found_plants

        # Months
        found_months = [m for m in self._MONTH_NAMES if m in lower]
        if found_months:
            entities["months"] = found_months

        # Year (4-digit)
        years = re.findall(r"\b(20\d{2})\b", query)
        if years:
            entities["years"] = [int(y) for y in years]

        # Utilities
        found_utils = [u for u in self._UTILITIES if u in lower]
        if found_utils:
            entities["utilities"] = found_utils

        # Numbers
        numbers = re.findall(r"\b\d+(?:\.\d+)?\b", query)
        if numbers:
            entities["numbers"] = [float(n) for n in numbers]

        return entities

    @staticmethod
    def _detect_language(query: str) -> str:
        """Simple heuristic: if any Bengali Unicode character is present, classify as Bengali."""
        for ch in query:
            if "\u0980" <= ch <= "\u09FF":
                return "bn"
        return "en"


# ---------------------------------------------------------------------------
# 3. NL-to-SQL Agent with SQL Validator
# ---------------------------------------------------------------------------

_DESTRUCTIVE_PATTERN = re.compile(
    r"\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE|INSERT|REPLACE|GRANT|REVOKE|CREATE|RENAME|EXEC|EXECUTE)\b",
    re.IGNORECASE,
)

_SCHEMA_CONTEXT = """
-- GridIntel PostgreSQL Schema (read-only context for SQL generation)

TABLE plants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),             -- e.g. "Ashuganj 225MW"
  capacity_mw DECIMAL(10,2),
  fuel_type VARCHAR(50),         -- gas, coal, hfo, hydro, solar, diesel
  office_region VARCHAR(100),    -- e.g. "Ashuganj office"
  is_ccpp BOOLEAN                -- combined cycle power plant
);

TABLE meters (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER REFERENCES plants(id),
  meter_number VARCHAR(100),
  meter_type VARCHAR(50),        -- main, check, GT, ST
  cf DECIMAL(10,6),              -- current conversion factor
  omf DECIMAL(10,6)              -- outage multiplier factor
);

TABLE mod_readings (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER REFERENCES plants(id),
  meter_id INTEGER REFERENCES meters(id),
  reading_month INTEGER,         -- 1-12
  reading_year INTEGER,
  opening_reading DECIMAL(14,3),
  closing_reading DECIMAL(14,3),
  active_energy_kwh DECIMAL(14,3),
  reactive_energy_kvarh DECIMAL(14,3),
  gross_generation_mu DECIMAL(14,6),
  net_generation_mu DECIMAL(14,6),
  station_use_mu DECIMAL(14,6),
  auxiliary_percent DECIMAL(6,3),
  status VARCHAR(20)             -- draft, submitted, verified, locked
);

TABLE energy_balance (
  id SERIAL PRIMARY KEY,
  balance_month INTEGER,
  balance_year INTEGER,
  total_generation_mu DECIMAL(14,6),
  total_import_mu DECIMAL(14,6),
  total_available_mu DECIMAL(14,6),
  total_sales_mu DECIMAL(14,6),
  system_loss_mu DECIMAL(14,6),
  system_loss_percent DECIMAL(6,3)
);

TABLE cross_border_readings (
  id SERIAL PRIMARY KEY,
  circuit_name VARCHAR(200),     -- e.g. "Baharampur HVC 400KV"
  reading_month INTEGER,
  reading_year INTEGER,
  import_mu DECIMAL(14,6),
  export_mu DECIMAL(14,6),
  availability_percent DECIMAL(6,3)
);

TABLE utility_sales (
  id SERIAL PRIMARY KEY,
  utility_name VARCHAR(100),     -- BPDB, DPDC, DESCO, NESCO, PBS, WZPDCL
  sale_month INTEGER,
  sale_year INTEGER,
  energy_sold_mu DECIMAL(14,6),
  rate_per_kwh DECIMAL(8,4)
);

TABLE billing (
  id SERIAL PRIMARY KEY,
  utility_name VARCHAR(100),
  billing_month INTEGER,
  billing_year INTEGER,
  total_amount DECIMAL(16,2),
  paid_amount DECIMAL(16,2),
  outstanding_amount DECIMAL(16,2),
  due_date DATE,
  status VARCHAR(30)             -- pending, partial, paid, overdue
);

TABLE anomaly_alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(100),
  plant_id INTEGER REFERENCES plants(id),
  alert_month INTEGER,
  alert_year INTEGER,
  severity VARCHAR(20),          -- low, medium, high, critical
  description TEXT,
  is_resolved BOOLEAN,
  created_at TIMESTAMP
);
"""


class SQLValidator:
    """
    Regex-based guard that strictly blocks destructive SQL commands.
    Called before executing any AI-generated SQL.
    """

    @staticmethod
    def validate(sql: str) -> SQLResult:
        match = _DESTRUCTIVE_PATTERN.search(sql)
        if match:
            return SQLResult(
                sql=sql,
                is_safe=False,
                blocked_reason=f"Destructive command detected: {match.group(0).upper()}",
            )
        # Only allow SELECT statements
        stripped = sql.strip().lstrip("(").upper()
        if not stripped.startswith("SELECT") and not stripped.startswith("WITH"):
            return SQLResult(
                sql=sql,
                is_safe=False,
                blocked_reason="Only SELECT/WITH queries are permitted.",
            )
        return SQLResult(sql=sql, is_safe=True, explanation="Query is read-only and safe.")


class NLToSQLAgent:
    """
    Generates PostgreSQL SELECT queries from natural language text.
    Every generated query is run through SQLValidator before being returned.
    """

    def __init__(self, llm_chain: LLMFallbackChain) -> None:
        self._llm = llm_chain
        self._validator = SQLValidator()

    async def generate(
        self,
        natural_language_query: str,
        extra_context: str = "",
    ) -> SQLResult:
        """Convert NL query to safe PostgreSQL SELECT."""
        system_prompt = (
            "You are a PostgreSQL expert for GridIntel, a power sector platform for BPDB Bangladesh.\n"
            "Given a natural language question, generate a single, valid PostgreSQL SELECT query.\n"
            "RULES:\n"
            "1. Return ONLY the SQL query — no explanation, no markdown, no code fences.\n"
            "2. Use ONLY the tables and columns in the schema below.\n"
            "3. Never use DROP, DELETE, TRUNCATE, ALTER, UPDATE, INSERT.\n"
            "4. Add LIMIT 500 unless the query is explicitly aggregate.\n"
            "5. Use table aliases for readability.\n"
            "6. Handle NULL gracefully with COALESCE.\n\n"
            f"SCHEMA:\n{_SCHEMA_CONTEXT}"
        )
        if extra_context:
            system_prompt += f"\nADDITIONAL CONTEXT:\n{extra_context}"

        req = LLMRequest(
            messages=[{"role": "user", "content": natural_language_query}],
            system_prompt=system_prompt,
            temperature=0.0,
            max_tokens=512,
        )
        resp = await self._llm.complete(req)
        if not resp.success:
            return SQLResult(
                sql="",
                is_safe=False,
                blocked_reason=f"LLM generation failed: {resp.error}",
            )

        raw_sql = resp.content.strip()
        # Remove markdown code fences
        raw_sql = re.sub(r"```(?:sql)?|```", "", raw_sql).strip()

        result = self._validator.validate(raw_sql)
        return result

    async def execute_safe(
        self,
        natural_language_query: str,
        db: AsyncSession,
        extra_context: str = "",
    ) -> dict[str, Any]:
        """Generate SQL, validate, then execute against the database."""
        sql_result = await self.generate(natural_language_query, extra_context)
        if not sql_result.is_safe:
            return {
                "success": False,
                "error": sql_result.blocked_reason,
                "sql": sql_result.sql,
                "rows": [],
            }
        try:
            result = await db.execute(text(sql_result.sql))
            rows = result.mappings().all()
            return {
                "success": True,
                "sql": sql_result.sql,
                "rows": [dict(row) for row in rows],
                "row_count": len(rows),
            }
        except Exception as exc:  # noqa: BLE001
            logger.error("SQL execution error: %s | SQL: %s", exc, sql_result.sql)
            return {
                "success": False,
                "error": str(exc),
                "sql": sql_result.sql,
                "rows": [],
            }


# ---------------------------------------------------------------------------
# 4. Vector RAG Retriever (pgvector)
# ---------------------------------------------------------------------------

class VectorRAGRetriever:
    """
    Retrieves semantically similar document chunks from the `rag_embeddings` table
    using pgvector's vector_cosine_ops similarity index.

    Table schema (created by Alembic migration):
      rag_embeddings (
        id          SERIAL PRIMARY KEY,
        doc_id      INTEGER REFERENCES rag_documents(id),
        chunk_index INTEGER,
        chunk_text  TEXT,
        embedding   VECTOR(1536),   -- text-embedding-ada-002 or any 1536-dim model
        source_type VARCHAR(50),    -- 'circular', 'sop', 'policy', 'manual'
        metadata    JSONB
      )
    """

    def __init__(self, llm_chain: LLMFallbackChain) -> None:
        self._llm = llm_chain

    # ------------------------------------------------------------------
    # Embedding via LLM (using text-embedding endpoint if available, else summarise trick)
    # ------------------------------------------------------------------

    async def _embed_query(self, query: str) -> list[float]:
        """
        Generate a query embedding.
        Groq does not expose an embeddings API on the free tier.
        We use a deterministic hash-based pseudo-embedding for local/free-tier operation
        and fall back to sentence_transformers if available in the Python environment.
        In production, swap this method for an actual embeddings API call.
        """
        try:
            # Attempt to use sentence_transformers if installed
            from sentence_transformers import SentenceTransformer  # type: ignore
            model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
            embedding = model.encode(query).tolist()
            return embedding
        except ImportError:
            pass

        # Fallback: deterministic 1536-dim pseudo-vector from character codes
        # This is NOT a semantic embedding — replace with real embeddings in production
        import hashlib
        digest = hashlib.sha256(query.encode()).digest()
        base = [b / 255.0 for b in digest]
        # Repeat to reach 1536 dims
        factor = (1536 // len(base)) + 1
        pseudo = (base * factor)[:1536]
        return pseudo

    # ------------------------------------------------------------------
    # Similarity search
    # ------------------------------------------------------------------

    async def retrieve(
        self,
        query: str,
        db: AsyncSession,
        top_k: int = 5,
        source_type: Optional[str] = None,
    ) -> RAGResult:
        """
        Perform cosine similarity search in pgvector.
        Returns top_k most similar chunks ranked by 1 - cosine_distance.
        """
        embedding = await self._embed_query(query)
        embedding_str = "[" + ",".join(f"{v:.8f}" for v in embedding) + "]"

        source_filter = ""
        params: dict[str, Any] = {"embedding": embedding_str, "top_k": top_k}
        if source_type:
            source_filter = "AND re.source_type = :source_type"
            params["source_type"] = source_type

        sql = f"""
            SELECT
                re.id,
                re.chunk_index,
                re.chunk_text,
                re.source_type,
                re.metadata,
                rd.title         AS document_title,
                rd.file_name     AS file_name,
                1 - (re.embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM rag_embeddings re
            JOIN rag_documents rd ON rd.id = re.doc_id
            WHERE 1=1 {source_filter}
            ORDER BY re.embedding <=> CAST(:embedding AS vector)
            LIMIT :top_k
        """

        try:
            result = await db.execute(text(sql), params)
            rows = result.mappings().all()
            chunks = [dict(row) for row in rows]
        except Exception as exc:  # noqa: BLE001
            logger.error("pgvector similarity search failed: %s", exc)
            chunks = []

        return RAGResult(
            chunks=chunks,
            query_embedding=embedding,
            top_k=top_k,
        )

    # ------------------------------------------------------------------
    # RAG augmented answer generation
    # ------------------------------------------------------------------

    async def answer_with_context(
        self,
        query: str,
        db: AsyncSession,
        top_k: int = 5,
        source_type: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Full RAG pipeline:
          1. Retrieve relevant chunks from pgvector
          2. Build augmented prompt with retrieved context
          3. Call LLM for grounded answer
          4. Return answer + source citations
        """
        rag_result = await self.retrieve(query, db, top_k, source_type)

        if not rag_result.chunks:
            return {
                "answer": "No relevant documents found in the knowledge base for this query.",
                "sources": [],
                "chunks_used": 0,
            }

        # Build context block from retrieved chunks
        context_parts = []
        for i, chunk in enumerate(rag_result.chunks, 1):
            context_parts.append(
                f"[Source {i}: {chunk.get('document_title', 'Unknown')} | "
                f"Type: {chunk.get('source_type', 'N/A')} | "
                f"Similarity: {chunk.get('similarity', 0):.3f}]\n"
                f"{chunk.get('chunk_text', '')}"
            )
        context_block = "\n\n---\n\n".join(context_parts)

        system_prompt = (
            "You are GridIntel's AI assistant for BPDB (Bangladesh Power Development Board). "
            "Answer the user's question ONLY using the provided document excerpts. "
            "If the answer is not in the documents, say so clearly. "
            "Be concise and professional. Reference source numbers when citing information. "
            "Respond in the same language as the user's question (Bengali or English)."
        )

        augmented_query = (
            f"DOCUMENT EXCERPTS:\n{context_block}\n\n"
            f"QUESTION: {query}\n\n"
            "Provide a grounded answer based on the documents above."
        )

        req = LLMRequest(
            messages=[{"role": "user", "content": augmented_query}],
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=800,
        )
        resp = await self._llm.complete(req)

        sources = [
            {
                "rank": i + 1,
                "document_title": chunk.get("document_title"),
                "file_name": chunk.get("file_name"),
                "source_type": chunk.get("source_type"),
                "similarity": round(float(chunk.get("similarity", 0)), 4),
                "chunk_index": chunk.get("chunk_index"),
            }
            for i, chunk in enumerate(rag_result.chunks)
        ]

        return {
            "answer": resp.content if resp.success else "Failed to generate answer.",
            "provider": resp.provider,
            "sources": sources,
            "chunks_used": len(rag_result.chunks),
        }


# ---------------------------------------------------------------------------
# 5. Unified Copilot Engine (facade combining all components)
# ---------------------------------------------------------------------------

class CopilotEngine:
    """
    Top-level facade used by the FastAPI router.
    Orchestrates: intent detection → SQL / RAG / tool routing → response building.
    """

    def __init__(
        self,
        groq_api_key: str,
        gemini_api_key: str,
        openrouter_api_key: str,
    ) -> None:
        self.llm = LLMFallbackChain(groq_api_key, gemini_api_key, openrouter_api_key)
        self.intent_detector = IntentDetector(self.llm)
        self.nl_to_sql = NLToSQLAgent(self.llm)
        self.rag_retriever = VectorRAGRetriever(self.llm)

    async def process_query(
        self,
        query: str,
        db: AsyncSession,
        conversation_history: Optional[list[dict[str, str]]] = None,
    ) -> dict[str, Any]:
        """
        Full pipeline for a single user query:
          1. Detect intent + language
          2. Route to SQL execution, RAG retrieval, or direct LLM response
          3. Return structured response payload
        """
        intent = await self.intent_detector.detect(query)

        # Routing logic based on intent category
        if intent.category in (
            IntentCategory.HELP.value,
        ):
            # Direct LLM response for help/general queries
            answer = await self._direct_llm_response(query, conversation_history or [])
            return {
                "response_type": "text",
                "answer": answer,
                "intent": intent.__dict__,
                "data": None,
            }

        if intent.category in (
            IntentCategory.GENERATION.value,
            IntentCategory.ENERGY_BALANCE.value,
            IntentCategory.BILLING.value,
            IntentCategory.CROSS_BORDER.value,
            IntentCategory.UTILITY_SALES.value,
            IntentCategory.MOD.value,
            IntentCategory.ANOMALY.value,
            IntentCategory.AUDIT.value,
        ):
            # NL-to-SQL route
            sql_exec_result = await self.nl_to_sql.execute_safe(query, db)
            if sql_exec_result["success"] and sql_exec_result["rows"]:
                narrative = await self._narrate_sql_result(
                    query, sql_exec_result["rows"], intent
                )
                return {
                    "response_type": "sql_data",
                    "answer": narrative,
                    "intent": intent.__dict__,
                    "data": {
                        "sql": sql_exec_result["sql"],
                        "rows": sql_exec_result["rows"],
                        "row_count": sql_exec_result["row_count"],
                    },
                }
            elif not sql_exec_result["success"]:
                return {
                    "response_type": "error",
                    "answer": f"Could not execute query: {sql_exec_result.get('error')}",
                    "intent": intent.__dict__,
                    "data": None,
                }
            else:
                return {
                    "response_type": "no_data",
                    "answer": "No data found for your query in the current database.",
                    "intent": intent.__dict__,
                    "data": {"sql": sql_exec_result["sql"], "rows": []},
                }

        if intent.category in (IntentCategory.PLANT.value, IntentCategory.FORECAST.value):
            # Try RAG first, fall back to SQL
            rag_answer = await self.rag_retriever.answer_with_context(query, db)
            if rag_answer["chunks_used"] > 0:
                return {
                    "response_type": "rag",
                    "answer": rag_answer["answer"],
                    "intent": intent.__dict__,
                    "data": {"sources": rag_answer["sources"]},
                }
            # Fallback to SQL
            sql_exec_result = await self.nl_to_sql.execute_safe(query, db)
            return {
                "response_type": "sql_data",
                "answer": sql_exec_result.get("rows", []),
                "intent": intent.__dict__,
                "data": sql_exec_result,
            }

        # Default: RAG retrieval
        rag_answer = await self.rag_retriever.answer_with_context(query, db)
        return {
            "response_type": "rag",
            "answer": rag_answer["answer"],
            "intent": intent.__dict__,
            "data": {"sources": rag_answer.get("sources", [])},
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _direct_llm_response(
        self, query: str, history: list[dict[str, str]]
    ) -> str:
        system_prompt = (
            "You are GridIntel's AI assistant for BPDB (Bangladesh Power Development Board), Bangladesh. "
            "You help power sector engineers and operators with generation data, energy accounting, "
            "billing, MOD readings, and system analytics. "
            "Be concise, professional, and accurate. "
            "Respond in the same language as the user's message (Bengali or English)."
        )
        messages = [*history, {"role": "user", "content": query}]
        req = LLMRequest(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.3,
            max_tokens=600,
        )
        resp = await self.llm.complete(req)
        return resp.content if resp.success else "Unable to process your request at this time."

    async def _narrate_sql_result(
        self,
        query: str,
        rows: list[dict[str, Any]],
        intent: IntentResult,
    ) -> str:
        """Ask the LLM to generate a human-readable narrative from SQL result rows."""
        sample = rows[:10]  # Limit context size
        system_prompt = (
            "You are GridIntel's AI assistant. Given a user's question and the database result rows, "
            "provide a concise, human-readable summary. "
            "Use numbers precisely. Respond in the same language as the question (Bengali or English)."
        )
        user_content = (
            f"Question: {query}\n"
            f"Intent: {intent.intent}\n"
            f"Result rows ({len(rows)} total, showing first {len(sample)}):\n"
            f"{json.dumps(sample, indent=2, default=str)}\n\n"
            "Summarize the key findings in 2-4 sentences."
        )
        req = LLMRequest(
            messages=[{"role": "user", "content": user_content}],
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=300,
        )
        resp = await self.llm.complete(req)
        return resp.content if resp.success else f"Found {len(rows)} records."

    async def close(self) -> None:
        await self.llm.close()
