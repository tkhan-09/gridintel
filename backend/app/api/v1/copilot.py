"""
GridIntel AI Copilot  —  /api/v1/copilot/chat
==============================================
Drop-in replacement for the existing copilot.py.
Keeps all original imports / naming conventions:
  • copilot_router  (matches main.py)
  • get_async_session  (matches main.py)
  • Session Annotated alias  (same as before)
  • get_query_embedding + L2 norm kept intact
  • ask_groq / ask_gemini kept intact

New additions:
  PROCESS 1 — NLU Intent & Entity Detection  (Groq JSON mode)
  PROCESS 2 — AI SQL Generation → Validate → Execute → NL Summary
  RAG fallback always available (unchanged pipeline)
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from enum import Enum
from typing import Annotated, Any

import httpx
import requests as req_lib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session

logger = logging.getLogger(__name__)

copilot_router = APIRouter(prefix="/copilot", tags=["Copilot"])

Session = Annotated[AsyncSession, Depends(get_async_session)]

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

GROQ_API_URL  = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL    = "llama-3.3-70b-versatile"

SQL_MAX_ROWS  = 50

SQL_BLOCKED_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE|MERGE"
    r"|EXEC|EXECUTE|GRANT|REVOKE|ATTACH|DETACH|PRAGMA|COPY|VACUUM)\b",
    re.IGNORECASE,
)

# ─────────────────────────────────────────────────────────────────────────────
# DB Schema fed to SQL-generation LLM
# ─────────────────────────────────────────────────────────────────────────────

DB_SCHEMA_CONTEXT = """
Available PostgreSQL tables (SELECT only):

plants (
    id SERIAL PRIMARY KEY,
    name VARCHAR,
    capacity_mw NUMERIC,
    fuel_type VARCHAR,       -- 'Gas','Coal','HFO','Diesel','Solar','Hydro','Wind','Nuclear'
    ownership VARCHAR,
    sector VARCHAR,          -- 'Public','Private'
    grid_voltage VARCHAR,    -- '132kV','33kV'
    office_id INTEGER,
    status VARCHAR,          -- 'Active','Inactive','Under Construction'
    parent_id INTEGER        -- nullable self-reference
)

meters (
    id SERIAL PRIMARY KEY,
    plant_id INTEGER REFERENCES plants(id),   -- FK to plants
    meter_number VARCHAR,
    meter_type VARCHAR,      -- 'Main','Check','Tie'
    multiplier NUMERIC,
    direction VARCHAR        -- 'Import','Export'
)

mod_readings (
    id SERIAL PRIMARY KEY,
    meter_id INTEGER REFERENCES meters(id),   -- FK to meters (NOT plant_id)
    month INTEGER,           -- 1-12
    year INTEGER,
    opening_reading DOUBLE PRECISION,
    closing_reading DOUBLE PRECISION,
    advanced_reading DOUBLE PRECISION,
    active_energy_kwh DOUBLE PRECISION,
    reactive_energy_kvarh DOUBLE PRECISION
)

offices (id SERIAL PRIMARY KEY, name VARCHAR)

cross_border_circuits (
    id SERIAL PRIMARY KEY,
    name VARCHAR,
    voltage_level VARCHAR,
    direction VARCHAR        -- 'Import','Export'
)

CRITICAL JOIN PATH — to get generation/reading data for a plant:
  plants p
    JOIN meters m      ON m.plant_id  = p.id
    JOIN mod_readings mr ON mr.meter_id = m.id

NEVER join mod_readings directly to plants — there is no mod_readings.plant_id column.

Example correct query:
  SELECT p.name, mr.year, mr.month, SUM(mr.active_energy_kwh) AS total_kwh
  FROM plants p
  JOIN meters m ON m.plant_id = p.id
  JOIN mod_readings mr ON mr.meter_id = m.id
  WHERE p.name ILIKE '%Haripura%'
  GROUP BY p.name, mr.year, mr.month
  ORDER BY mr.year, mr.month
  LIMIT 50;
""".strip()

# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: str = ""
    conversation_history: list[dict] = []


class Intent(str, Enum):
    SQL_ANALYTICS = "sql_analytics"   # totals, counts, averages, trends
    SQL_LOOKUP    = "sql_lookup"      # fetch specific records
    API_ACTION    = "api_action"      # submit/verify/lock workflow
    ASK_POLICY    = "ask_policy"      # policy/regulation/manual → RAG
    GENERAL_QA    = "general_qa"      # general power-sector knowledge → RAG
    GREETING      = "greeting"
    OUT_OF_SCOPE  = "out_of_scope"


class IntentResult(BaseModel):
    intent:     Intent
    confidence: float
    entities:   dict[str, Any]
    reasoning:  str

# ─────────────────────────────────────────────────────────────────────────────
# Existing helpers — unchanged
# ─────────────────────────────────────────────────────────────────────────────

def get_query_embedding(query: str) -> list[float]:
    """gemini-embedding-001 REST API দিয়ে 768-dim query embedding।"""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not found.")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/gemini-embedding-001:embedContent?key={api_key}"
    )
    payload = {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": query}]},
        "taskType": "RETRIEVAL_QUERY",
        "outputDimensionality": 768,
    }
    resp = req_lib.post(url, json=payload, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini embedding error: {resp.status_code} — {resp.text}")

    emb = resp.json()["embedding"]["values"]
    norm = math.sqrt(sum(v * v for v in emb))
    if norm > 0:
        emb = [v / norm for v in emb]
    return emb


async def search_rag(query: str, db: AsyncSession, top_k: int = 3) -> str:
    try:
        emb = get_query_embedding(query)
        emb_str = "[" + ",".join(f"{v:.8f}" for v in emb) + "]"
        result = await db.execute(
            text("""
                SELECT title, content,
                       1 - (embedding <=> CAST(:emb AS vector)) AS similarity
                FROM rag_documents
                ORDER BY embedding <=> CAST(:emb AS vector)
                LIMIT :k
            """),
            {"emb": emb_str, "k": top_k},
        )
        rows = result.fetchall()
        if not rows:
            return ""
        context = ""
        for row in rows:
            context += f"\n--- {row.title} ---\n{row.content[:2000]}\n"
        return context
    except Exception as e:
        print(f"[RAG search error] {e}")
        return ""


async def ask_groq(message: str, context: str) -> str:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise Exception("Groq key not set")

    system = (
        "You are GridIntel AI, a power sector assistant for BPDB. "
        "Answer in the same language as the question."
    )
    if context:
        system += f"\n\nUse the following documents to answer:\n{context}"

    async with httpx.AsyncClient() as client:
        r = await client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": message},
                ],
                "max_tokens": 1024,
            },
            timeout=20,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def ask_gemini(message: str, context: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise Exception("Gemini key not set")

    prompt = message
    if context:
        prompt = f"Documents:\n{context}\n\nQuestion: {message}"

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-1.5-flash:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=20,
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]

# ─────────────────────────────────────────────────────────────────────────────
# PROCESS 1 — Intent & Entity Detection
# ─────────────────────────────────────────────────────────────────────────────

_INTENT_SYSTEM = """You are the NLU engine for GridIntel — a Power Sector Intelligence Platform
for Bangladesh Power Development Board (BPDB).

Classify the user message and extract entities. Respond ONLY with valid JSON, no markdown.

INTENT CATEGORIES:
  sql_analytics  — DB aggregation: totals, counts, averages, trends, rankings
  sql_lookup     — fetch specific records: one plant, meter list, circuit details
  api_action     — trigger workflow: submit readings, verify, lock month
  ask_policy     — policies, regulations, tariff orders, manuals, procedures
  general_qa     — general power-sector / energy / BPDB knowledge
  greeting       — hello, thanks, chitchat
  out_of_scope   — unrelated to power/energy/BPDB

ENTITY TYPES (omit if not present):
  plant_name, plant_id, fuel_type, sector, month (int 1-12), year (int),
  office_name, voltage_level, status, direction (Import/Export),
  metric (capacity_mw/gross_gen_kwh/active_energy_kwh), limit_n (int)

JSON schema:
{
  "intent": "<category>",
  "confidence": <0.0-1.0>,
  "entities": { "<type>": <value> },
  "reasoning": "<one sentence>"
}"""


async def detect_intent(message: str, history: list[dict]) -> IntentResult:
    recent = history[-4:] if len(history) > 4 else history
    messages = [{"role": "system", "content": _INTENT_SYSTEM}]
    messages.extend(recent)
    messages.append({"role": "user", "content": message})

    api_key = os.getenv("GROQ_API_KEY", "")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": 0.0,
                "max_tokens": 512,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()
        raw = r.json()["choices"][0]["message"]["content"]

    try:
        data = json.loads(raw)
        return IntentResult(
            intent=data.get("intent", Intent.GENERAL_QA),
            confidence=float(data.get("confidence", 0.5)),
            entities=data.get("entities", {}),
            reasoning=data.get("reasoning", ""),
        )
    except Exception as exc:
        logger.warning("Intent parse error: %s | raw: %s", exc, raw)
        return IntentResult(
            intent=Intent.GENERAL_QA,
            confidence=0.3,
            entities={},
            reasoning="Fallback due to parse error",
        )

# ─────────────────────────────────────────────────────────────────────────────
# PROCESS 2 — AI SQL Generation
# ─────────────────────────────────────────────────────────────────────────────

_SQL_SYSTEM = f"""You are a PostgreSQL expert for GridIntel (Bangladesh Power Development Board).

DATABASE SCHEMA:
{DB_SCHEMA_CONTEXT}

STRICT RULES:
1. Output ONE raw SELECT statement only — no markdown, no explanation.
2. NEVER use INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE, EXEC.
3. Add LIMIT {SQL_MAX_ROWS} unless the query is a pure aggregate (COUNT/SUM/AVG with no GROUP BY detail rows).
4. Use table aliases (p=plants, mr=mod_readings, m=meters, o=offices).
5. Text filters → ILIKE '%value%'.
6. Month names → integers (January=1 … December=12).
7. Never select hashed_password.
8. Use readable column aliases in SELECT list.
"""


async def generate_sql(message: str, intent: IntentResult) -> str:
    entity_hint = json.dumps(intent.entities, ensure_ascii=False) if intent.entities else "none"
    prompt = (
        f"User question: {message}\n"
        f"Intent: {intent.intent}\n"
        f"Entities: {entity_hint}\n\n"
        f"Generate a PostgreSQL SELECT query. LIMIT {SQL_MAX_ROWS} unless pure aggregate."
    )
    api_key = os.getenv("GROQ_API_KEY", "")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": _SQL_SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                "temperature": 0.0,
                "max_tokens": 512,
            },
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()


def validate_sql(sql: str) -> tuple[bool, str]:
    """Returns (is_valid, cleaned_sql_or_error_reason)."""
    clean = sql.strip()

    # Strip markdown fences if model ignored instructions
    if clean.startswith("```"):
        clean = re.sub(r"^```[a-z]*\n?", "", clean)
        clean = re.sub(r"\n?```$", "", clean).strip()

    if not clean.upper().startswith("SELECT"):
        return False, "Query must start with SELECT."

    if SQL_BLOCKED_KEYWORDS.search(clean):
        kw = SQL_BLOCKED_KEYWORDS.search(clean).group()
        return False, f"Blocked keyword detected: {kw}"

    parts = [s.strip() for s in clean.split(";") if s.strip()]
    if len(parts) > 1:
        return False, "Multiple statements not allowed."

    if "--" in clean or "/*" in clean:
        return False, "SQL comments not allowed."

    return True, clean


async def execute_sql(db: AsyncSession, sql: str) -> list[dict]:
    try:
        result = await db.execute(text(sql))
        rows   = result.fetchmany(SQL_MAX_ROWS)
        cols   = list(result.keys())
        return [dict(zip(cols, row)) for row in rows]
    except Exception:
        await db.rollback()  # Reset aborted transaction — allows RAG fallback to work
        raise


async def rows_to_nl(message: str, sql: str, rows: list[dict]) -> str:
    if not rows:
        return (
            "The query returned no results. "
            "The data may not exist or the filters were too specific."
        )

    preview = json.dumps(rows[:20], ensure_ascii=False, default=str)
    prompt  = (
        f'User asked: "{message}"\n\n'
        f"SQL:\n{sql}\n\n"
        f"Result ({len(rows)} row(s)):\n{preview}\n\n"
        "Give a clear, concise 2-4 sentence natural-language answer. "
        "Highlight the most important numbers. "
        "If many rows, summarise patterns rather than listing everything."
    )
    api_key = os.getenv("GROQ_API_KEY", "")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are GridIntel's data analyst for Bangladesh Power Development Board. "
                            "Summarise query results clearly. Answer in the same language as the question."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 512,
            },
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

# ─────────────────────────────────────────────────────────────────────────────
# Main chat endpoint
# ─────────────────────────────────────────────────────────────────────────────

@copilot_router.post("/chat")
async def chat(req: ChatRequest, db: Session):
    """
    AI Copilot chat — Intent Detection → SQL or RAG routing.

    Flow:
      1. Detect intent + extract entities  (Groq JSON mode)
      2. Route:
           sql_analytics / sql_lookup  →  Process 2: SQL gen → validate → execute → NL summary
           api_action                  →  Groq explains the action + guides to UI
           ask_policy / general_qa     →  RAG search → Groq answer
           greeting                    →  Direct Groq reply
           out_of_scope                →  Polite decline
      3. Any SQL failure               →  fallback to RAG (original pipeline)
    """
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    history = req.conversation_history

    # ── PROCESS 1: Intent Detection ────────────────────────────────────────
    try:
        intent_result = await detect_intent(message, history)
        logger.info(
            "Intent=%s conf=%.2f entities=%s",
            intent_result.intent, intent_result.confidence, intent_result.entities,
        )
    except Exception as exc:
        logger.warning("Intent detection failed: %s — falling back to RAG", exc)
        intent_result = IntentResult(
            intent=Intent.GENERAL_QA, confidence=0.3, entities={}, reasoning="detection error"
        )

    # ── Greeting ───────────────────────────────────────────────────────────
    if intent_result.intent == Intent.GREETING:
        errors = []
        for provider, fn in [("Groq", ask_groq), ("Gemini", ask_gemini)]:
            try:
                answer = await fn(message, "")
                return {
                    "response": answer,
                    "provider": provider,
                    "intent": intent_result.intent,
                    "confidence": intent_result.confidence,
                    "entities": intent_result.entities,
                    "rag_used": False,
                    "source": "direct",
                }
            except Exception as e:
                errors.append(f"{provider}: {e}")
        return {"response": "All AI providers failed: " + " | ".join(errors)}

    # ── Out of scope ───────────────────────────────────────────────────────
    if intent_result.intent == Intent.OUT_OF_SCOPE:
        return {
            "response": (
                "আমি GridIntel Copilot — Bangladesh Power Development Board (BPDB) এর জন্য "
                "বিশেষভাবে তৈরি। Power plants, generation data, MOD readings, billing, "
                "cross-border circuits, এবং BPDB policies সংক্রান্ত প্রশ্ন করুন।"
            ),
            "intent": intent_result.intent,
            "confidence": intent_result.confidence,
            "entities": intent_result.entities,
            "rag_used": False,
            "source": "direct",
        }

    # ── API Action guidance ────────────────────────────────────────────────
    if intent_result.intent == Intent.API_ACTION:
        guidance_prompt = (
            "You are GridIntel Copilot. The user wants to perform a workflow action. "
            "Explain what the action does and guide them to the correct UI page.\n"
            "Available pages: MOD Entry (/mod-entry), Submissions & Verification (/submissions), "
            "Energy Accounting (/energy-accounting), Cross-border (/cross-border).\n"
            "Be helpful and specific. Answer in the same language as the question."
        )
        errors = []
        for provider, fn in [("Groq", ask_groq), ("Gemini", ask_gemini)]:
            try:
                answer = await fn.__wrapped__(message, "") if hasattr(fn, "__wrapped__") else None
            except Exception:
                pass
        # Use ask_groq with custom system via direct call
        api_key = os.getenv("GROQ_API_KEY", "")
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    GROQ_API_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": GROQ_MODEL,
                        "messages": [
                            {"role": "system", "content": guidance_prompt},
                            {"role": "user",   "content": message},
                        ],
                        "max_tokens": 512,
                        "temperature": 0.3,
                    },
                )
                r.raise_for_status()
                answer = r.json()["choices"][0]["message"]["content"]
        except Exception as exc:
            answer = (
                "Please use the GridIntel UI to perform this action: "
                "MOD Entry → /mod-entry | Submissions → /submissions | "
                "Energy Accounting → /energy-accounting"
            )
        return {
            "response": answer,
            "intent": intent_result.intent,
            "confidence": intent_result.confidence,
            "entities": intent_result.entities,
            "rag_used": False,
            "source": "direct",
        }

    # ── PROCESS 2: SQL Generation (sql_analytics / sql_lookup) ─────────────
    if intent_result.intent in (Intent.SQL_ANALYTICS, Intent.SQL_LOOKUP):
        sql_query: str | None = None
        data_rows: list[dict] | None = None
        try:
            # Step 1 — Generate
            raw_sql = await generate_sql(message, intent_result)
            logger.info("Generated SQL: %s", raw_sql)

            # Step 2 — Validate
            is_valid, result_or_reason = validate_sql(raw_sql)
            if not is_valid:
                raise ValueError(f"SQL validation failed: {result_or_reason}")
            sql_query = result_or_reason

            # Step 3 — Execute
            data_rows = await execute_sql(db, sql_query)
            logger.info("SQL returned %d row(s)", len(data_rows))

            # Step 4 — Natural language summary
            answer = await rows_to_nl(message, sql_query, data_rows)

            return {
                "response":   answer,
                "provider":   "Groq",
                "intent":     intent_result.intent,
                "confidence": intent_result.confidence,
                "entities":   intent_result.entities,
                "sql_query":  sql_query,
                "data_rows":  data_rows[:20],
                "rag_used":   False,
                "source":     "sql",
            }

        except Exception as exc:
            logger.warning(
                "SQL pipeline failed (%s) — falling back to RAG. SQL was: %s", exc, sql_query
            )
            # Fall through to RAG ↓

    # ── RAG Fallback — ask_policy / general_qa / SQL failures ──────────────
    context = await search_rag(message, db)
    errors  = []
    for provider, fn in [("Groq", ask_groq), ("Gemini", ask_gemini)]:
        try:
            answer = await fn(message, context)
            return {
                "response":   answer,
                "provider":   provider,
                "intent":     intent_result.intent,
                "confidence": intent_result.confidence,
                "entities":   intent_result.entities,
                "rag_used":   bool(context),
                "source":     "rag",
            }
        except Exception as e:
            errors.append(f"{provider}: {str(e)}")

    return {"response": "All AI providers failed: " + " | ".join(errors)}