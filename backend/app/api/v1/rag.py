from __future__ import annotations

import io
import os
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from app.core.database import get_async_session
from typing import Annotated

rag_router = APIRouter(prefix="/rag", tags=["RAG"])

Session = Annotated[AsyncSession, Depends(get_async_session)]


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return [c.strip() for c in chunks if c.strip()]


def get_embedding(text_input: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    """
    gemini-embedding-001 REST API দিয়ে 768-dim embedding।
    task_type: "RETRIEVAL_DOCUMENT" (upload) বা "RETRIEVAL_QUERY" (search)
    SDK লাগে না — শুধু requests।
    """
    import math
    import requests

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not found in environment variables.")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/"
        f"models/gemini-embedding-001:embedContent?key={api_key}"
    )

    payload = {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": text_input}]},
        "taskType": task_type,
        "outputDimensionality": 768,
    }

    resp = requests.post(url, json=payload, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(
            f"Gemini embedding API error: {resp.status_code} — {resp.text}"
        )

    emb = resp.json()["embedding"]["values"]  # 768-dim list[float]

    # Manual L2 normalization (768 dim এ required)
    norm = math.sqrt(sum(v * v for v in emb))
    if norm > 0:
        emb = [v / norm for v in emb]

    return emb


def extract_text(content: bytes, filename: str) -> str:
    if filename.lower().endswith(".pdf"):
        try:
            import fitz
            doc = fitz.open(stream=content, filetype="pdf")
            return "\n".join(page.get_text() for page in doc)
        except Exception:
            pass
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                return "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception:
            pass
        return content.decode("utf-8", errors="ignore")
    return content.decode("utf-8", errors="ignore")


@rag_router.post("/upload")
async def upload_rag_document(
    db: Session,
    file: UploadFile = File(...),
    source_type: str = Form("manual"),
    title: Optional[str] = Form(None),
):
    allowed = {".pdf", ".txt", ".md"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type {ext} not supported. Use: {allowed}")

    content_bytes = await file.read()
    if len(content_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    raw_text = extract_text(content_bytes, file.filename or "")
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file.")

    doc_title = title or file.filename or "Untitled"
    chunks = chunk_text(raw_text)

    # Gemini embedding — 768 dim
    try:
        first_embedding = get_embedding(chunks[0] if chunks else raw_text[:500])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")

    embedding_str = "[" + ",".join(f"{v:.8f}" for v in first_embedding) + "]"

    # Validate doc_type enum
    valid_types = ["Policy", "Manual", "Regulation", "TariffOrder"]
    doc_type = source_type if source_type in valid_types else "Manual"

    # Insert document
    result = await db.execute(
        text("""
            INSERT INTO rag_documents (title, content, doc_type, file_path, embedding, chunk_count)
            VALUES (:title, :content, CAST(:doc_type AS rag_doc_type_enum), :file_path, CAST(:embedding AS vector), :chunk_count)
            RETURNING id
        """),
        {
            "title": doc_title,
            "content": raw_text[:50000],
            "doc_type": doc_type,
            "file_path": file.filename,
            "embedding": embedding_str,
            "chunk_count": len(chunks),
        }
    )
    doc_id = result.scalar_one()
    await db.commit()

    return {
        "success": True,
        "doc_id": doc_id,
        "title": doc_title,
        "chunks": len(chunks),
        "source_type": doc_type,
        "message": f"Document uploaded and indexed with {len(chunks)} chunks."
    }


@rag_router.get("/documents")
async def list_documents(db: Session):
    result = await db.execute(text(
        "SELECT id, title, doc_type, file_path, uploaded_at, chunk_count FROM rag_documents ORDER BY uploaded_at DESC LIMIT 50"
    ))
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@rag_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int, db: Session):
    await db.execute(text("DELETE FROM rag_documents WHERE id = :id"), {"id": doc_id})
    await db.commit()
    return {"success": True, "deleted_id": doc_id}


@rag_router.get("/search")
async def search_documents(query: str, db: Session, limit: int = 5):
    """
    Query embedding তৈরি করে vector similarity search করে।
    """
    try:
        query_embedding = get_embedding(query, task_type="RETRIEVAL_QUERY")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query embedding failed: {str(e)}")

    embedding_str = "[" + ",".join(f"{v:.8f}" for v in query_embedding) + "]"

    result = await db.execute(
        text("""
            SELECT id, title, doc_type, file_path, uploaded_at,
                   1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM rag_documents
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT :limit
        """),
        {"embedding": embedding_str, "limit": limit}
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]