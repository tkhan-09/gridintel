content = """from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.deps import get_current_active_user
import httpx, os

copilot_router = APIRouter(prefix="/copilot", tags=["Copilot"])

class ChatRequest(BaseModel):
    message: str
    session_id: str = ""

async def ask_groq(message: str) -> str:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key or "your" in api_key:
        raise Exception("Groq key not set")
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "llama3-70b-8192", "messages": [{"role": "system", "content": "You are GridIntel AI, a power sector assistant for BPDB. Answer in the same language as the question."}, {"role": "user", "content": message}], "max_tokens": 1024},
            timeout=20
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

async def ask_gemini(message: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or "your" in api_key:
        raise Exception("Gemini key not set")
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": message}]}]},
            timeout=20
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]

@copilot_router.post("/chat")
async def chat(req: ChatRequest, current_user=Depends(get_current_active_user)):
    errors = []
    for provider, fn in [("Groq", ask_groq), ("Gemini", ask_gemini)]:
        try:
            answer = await fn(req.message)
            return {"response": answer, "provider": provider}
        except Exception as e:
            errors.append(f"{provider}: {str(e)}")
    return {"response": "All AI providers failed: " + " | ".join(errors)}
"""
open(r'E:\AI Projects\gridintel\backend\app\api\v1\copilot.py', 'w', encoding='utf-8').write(content)
print('Done')
