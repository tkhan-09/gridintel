from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_async_session
from typing import Annotated
import httpx, os, math, requests as req_lib

copilot_router = APIRouter(prefix="/copilot", tags=["Copilot"])

Session = Annotated[AsyncSession, Depends(get_async_session)]


class ChatRequest(BaseModel):
    message: str
    session_id: str = ""


def get_query_embedding(query: str) -> list[float]:
    """
    gemini-embedding-001 REST API দিয়ে 768-dim query embedding।
    task_type=RETRIEVAL_QUERY — search এর জন্য optimize।
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not found.")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/"
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

    # Manual L2 normalization
    norm = math.sqrt(sum(v * v for v in emb))
    if norm > 0:
        emb = [v / norm for v in emb]

    return emb


async def search_rag(query: str, db: AsyncSession, top_k: int = 3) -> str:
    try:
        emb = get_query_embedding(query)
        emb_str = "[" + ",".join(f"{v:.8f}" for v in emb) + "]"
        result = await db.execute(text("""
            SELECT title, content,
                   1 - (embedding <=> CAST(:emb AS vector)) AS similarity
            FROM rag_documents
            ORDER BY embedding <=> CAST(:emb AS vector)
            LIMIT :k
        """), {"emb": emb_str, "k": top_k})
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

    system = "You are GridIntel AI, a power sector assistant for BPDB. Answer in the same language as the question."
    if context:
        system += f"\n\nUse the following documents to answer:\n{context}"

    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": message}
                ],
                "max_tokens": 1024
            },
            timeout=20
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
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=20
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]


@copilot_router.post("/chat")
async def chat(req: ChatRequest, db: Session):
    context = await search_rag(req.message, db)
    errors = []
    for provider, fn in [("Groq", ask_groq), ("Gemini", ask_gemini)]:
        try:
            answer = await fn(req.message, context)
            return {
                "response": answer,
                "provider": provider,
                "rag_used": bool(context)
            }
        except Exception as e:
            errors.append(f"{provider}: {str(e)}")
    return {"response": "All AI providers failed: " + " | ".join(errors)}