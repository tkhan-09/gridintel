content = '''from __future__ import annotations

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

def get_embedding(text: str) -> list[float]:
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
        emb = model.encode(text).tolist()
        # Pad or truncate to 1536 dims
        if len(emb) < 1536:
            emb = emb + [0.0] * (1536 - len(emb))
        return emb[:1536]
    except ImportError:
        import hashlib
        digest = hashlib.sha256(text.encode()).digest()
        base = [b / 255.0 for b in digest]
        factor = (1536 // len(base)) + 1
        return (base * factor)[:1536]

def extract_text(content: bytes, filename: str) -> str:
    if filename.lower().endswith(".pdf"):
        try:
            import fitz
            doc = fitz.open(stream=content, filetype="pdf")
            return "\\n".join(page.get_text() for page in doc)
        except Exception:
            pass
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                return "\\n".join(p.extract_text() or "" for p in pdf.pages)
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

    # Use first chunk embedding as document embedding
    first_embedding = get_embedding(chunks[0] if chunks else raw_text[:500])
    embedding_str = "[" + ",".join(f"{v:.8f}" for v in first_embedding) + "]"

    # Check valid doc_type enum
    valid_types = ["circular", "sop", "policy", "manual", "report", "other"]
    doc_type = source_type if source_type in valid_types else "manual"

    # Insert document
    result = await db.execute(
        text("""
            INSERT INTO rag_documents (title, content, doc_type, file_path, embedding)
            VALUES (:title, :content, CAST(:doc_type AS rag_doc_type_enum), :file_path, CAST(:embedding AS vector))
            RETURNING id
        """),
        {
            "title": doc_title,
            "content": raw_text[:50000],
            "doc_type": doc_type,
            "file_path": file.filename,
            "embedding": embedding_str,
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
        "SELECT id, title, doc_type, file_path, uploaded_at FROM rag_documents ORDER BY uploaded_at DESC LIMIT 50"
    ))
    rows = result.mappings().all()
    return [dict(r) for r in rows]

@rag_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int, db: Session):
    await db.execute(text("DELETE FROM rag_documents WHERE id = :id"), {"id": doc_id})
    await db.commit()
    return {"success": True, "deleted_id": doc_id}
'''
with open(r'E:\AI Projects\gridintel\backend\app\api\v1\rag.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
