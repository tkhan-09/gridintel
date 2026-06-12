"""
GridIntel OCR Microservice
Standalone FastAPI service for high-accuracy text extraction from BPDB data tables.
Uses PaddleOCR for multi-language (English/Bengali) structured document processing.
"""

from __future__ import annotations

import asyncio
import io
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_FILE_SIZE_MB = 50
SUPPORTED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/webp",
}
TEMP_DIR = Path("/tmp/ocr_uploads")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Thread pool for CPU-bound PaddleOCR inference
_executor = ThreadPoolExecutor(max_workers=4)


# ---------------------------------------------------------------------------
# Task state management (in-memory; replace with Redis in production)
# ---------------------------------------------------------------------------

class TaskStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass
class ExtractedField:
    field_name: str       # Plant, Month, MeterNumber, Readings, CF, OMF
    raw_text: str
    normalized_value: Any
    confidence: float
    bounding_box: list[list[float]]  # [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]
    page_number: int


@dataclass
class PageResult:
    page_number: int
    raw_text_lines: list[str]
    extracted_fields: list[ExtractedField]
    table_rows: list[list[str]]    # Detected table cell content
    processing_time_ms: int


@dataclass
class OCRTaskResult:
    task_id: str
    status: TaskStatus
    file_name: str
    total_pages: int
    pages: list[PageResult]
    summary: dict[str, Any]
    created_at: float
    completed_at: Optional[float]
    error_message: Optional[str]


# Global task store
_task_store: dict[str, OCRTaskResult] = {}


def _get_task(task_id: str) -> OCRTaskResult:
    task = _task_store.get(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task '{task_id}' not found.",
        )
    return task


# ---------------------------------------------------------------------------
# PaddleOCR engine wrapper
# ---------------------------------------------------------------------------

class PaddleOCREngine:
    """
    Thread-safe singleton wrapper around PaddleOCR.
    Lazy-initialized on first use to avoid import-time GPU init overhead.
    """

    _instance: Optional["PaddleOCREngine"] = None
    _ocr: Any = None

    def __new__(cls) -> "PaddleOCREngine":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _ensure_initialized(self) -> None:
        if self._ocr is not None:
            return
        try:
            from paddleocr import PaddleOCR  # type: ignore
            self._ocr = PaddleOCR(
                use_angle_cls=True,
                lang="en",           # English primary; use 'ch' for Chinese/multi
                use_gpu=False,       # CPU-only for Docker compatibility
                show_log=False,
                det_db_thresh=0.3,
                det_db_box_thresh=0.5,
                rec_batch_num=8,
            )
            logger.info("PaddleOCR initialized successfully.")
        except ImportError as exc:
            logger.error("PaddleOCR not available: %s", exc)
            raise RuntimeError(
                "PaddleOCR is not installed. Install with: pip install paddleocr"
            ) from exc

    def run_ocr(self, image_array: "np.ndarray") -> list[Any]:
        """
        Run OCR on a numpy image array.
        Returns PaddleOCR result: list of [bounding_box, (text, confidence)] per line.
        """
        self._ensure_initialized()
        result = self._ocr.ocr(image_array, cls=True)
        return result[0] if result else []


_ocr_engine = PaddleOCREngine()


# ---------------------------------------------------------------------------
# Field extractors
# ---------------------------------------------------------------------------

_FIELD_PATTERNS: dict[str, dict[str, Any]] = {
    "Plant": {
        "keywords": [
            "ashuganj", "payra", "haripur", "ghorashal", "barapukuria",
            "meghnaghat", "siddhirgonj", "cumilla",
        ],
        "is_keyword_match": True,
    },
    "Month": {
        "pattern": r"\b(january|february|march|april|may|june|july|august|"
                   r"september|october|november|december)\s+\d{4}\b",
        "is_keyword_match": False,
    },
    "MeterNumber": {
        "pattern": r"\b[A-Z0-9]{3,20}[-/]?[0-9]{0,8}\b",
        "is_keyword_match": False,
        "context_keywords": ["meter", "no.", "number", "sr."],
    },
    "CF": {
        "pattern": r"\b\d+\.\d{4,8}\b",
        "context_keywords": ["cf", "conversion", "factor"],
        "is_keyword_match": False,
    },
    "OMF": {
        "pattern": r"\b\d+\.\d{4,8}\b",
        "context_keywords": ["omf", "outage", "multiplier"],
        "is_keyword_match": False,
    },
    "Readings": {
        "pattern": r"\b\d{1,7}(?:\.\d{1,3})?\b",
        "context_keywords": ["reading", "opening", "closing", "kwh", "kvarh"],
        "is_keyword_match": False,
    },
}


import re as _re


def _extract_fields_from_lines(
    ocr_lines: list[Any],
    page_number: int,
) -> tuple[list[ExtractedField], list[list[str]]]:
    """
    Analyse OCR line results to extract structured BPDB form fields.
    Returns (extracted_fields, table_rows).
    """
    extracted: list[ExtractedField] = []
    table_rows: list[list[str]] = []

    # Group lines by approximate Y position (same row = same table row)
    line_groups: dict[int, list[tuple[float, str, float, list]]] = {}
    for item in ocr_lines:
        if not item or len(item) < 2:
            continue
        bbox, (text, conf) = item[0], item[1]
        # Y center of bounding box
        y_center = (bbox[0][1] + bbox[2][1]) / 2.0
        # Bucket into ~20px rows
        row_bucket = int(y_center / 20) * 20
        x_left = bbox[0][0]
        line_groups.setdefault(row_bucket, []).append((x_left, text, conf, bbox))

    # Sort groups by Y, then cells left-to-right
    for y_bucket in sorted(line_groups.keys()):
        cells = sorted(line_groups[y_bucket], key=lambda x: x[0])
        row_texts = [c[1] for c in cells]
        table_rows.append(row_texts)

        # Check each cell for known field patterns
        for x_left, text, conf, bbox in cells:
            text_lower = text.lower().strip()

            for field_name, config in _FIELD_PATTERNS.items():
                if config.get("is_keyword_match"):
                    for kw in config["keywords"]:
                        if kw in text_lower:
                            extracted.append(ExtractedField(
                                field_name=field_name,
                                raw_text=text,
                                normalized_value=_normalize_field(field_name, text),
                                confidence=float(conf),
                                bounding_box=bbox,
                                page_number=page_number,
                            ))
                            break
                else:
                    pattern = config.get("pattern", "")
                    if pattern and _re.search(pattern, text, _re.IGNORECASE):
                        # Verify context if required
                        ctx_kws = config.get("context_keywords", [])
                        if not ctx_kws or any(k in text_lower for k in ctx_kws):
                            extracted.append(ExtractedField(
                                field_name=field_name,
                                raw_text=text,
                                normalized_value=_normalize_field(field_name, text),
                                confidence=float(conf),
                                bounding_box=bbox,
                                page_number=page_number,
                            ))

    return extracted, table_rows


def _normalize_field(field_name: str, raw_text: str) -> Any:
    """Convert raw OCR text to typed value based on field name."""
    text = raw_text.strip()
    if field_name in ("CF", "OMF", "Readings"):
        try:
            match = _re.search(r"\d+(?:\.\d+)?", text.replace(",", ""))
            return float(match.group()) if match else None
        except (ValueError, AttributeError):
            return None
    if field_name == "Month":
        match = _re.search(
            r"(january|february|march|april|may|june|july|august|"
            r"september|october|november|december)\s+(\d{4})",
            text,
            _re.IGNORECASE,
        )
        if match:
            return f"{match.group(1).capitalize()} {match.group(2)}"
        return text
    return text


def _build_summary(pages: list[PageResult]) -> dict[str, Any]:
    """Aggregate extracted fields across all pages into a flat summary dict."""
    all_fields: list[ExtractedField] = [f for p in pages for f in p.extracted_fields]

    def pick_best(field_name: str) -> Any:
        candidates = [f for f in all_fields if f.field_name == field_name]
        if not candidates:
            return None
        return max(candidates, key=lambda x: x.confidence).normalized_value

    readings_fields = [f for f in all_fields if f.field_name == "Readings"]
    readings_values = sorted(
        set(
            float(f.normalized_value)
            for f in readings_fields
            if f.normalized_value is not None
        )
    )

    return {
        "Plant": pick_best("Plant"),
        "Month": pick_best("Month"),
        "MeterNumber": pick_best("MeterNumber"),
        "CF": pick_best("CF"),
        "OMF": pick_best("OMF"),
        "Readings": readings_values,
        "total_fields_extracted": len(all_fields),
        "avg_confidence": (
            sum(f.confidence for f in all_fields) / len(all_fields)
            if all_fields else 0.0
        ),
    }


# ---------------------------------------------------------------------------
# PDF → image conversion
# ---------------------------------------------------------------------------

def _pdf_to_images(file_bytes: bytes) -> list["np.ndarray"]:
    """
    Convert PDF pages to numpy image arrays using pypdf2 + PIL fallback.
    Uses pdf2image (poppler) if available, otherwise extracts embedded images.
    """
    images = []
    try:
        from pdf2image import convert_from_bytes  # type: ignore
        pil_images = convert_from_bytes(file_bytes, dpi=200)
        for img in pil_images:
            images.append(np.array(img))
        return images
    except ImportError:
        pass

    # Fallback: pypdf2 for single-page PDFs or text extraction
    try:
        import PyPDF2  # type: ignore
        from PIL import Image  # type: ignore

        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        for page_num, page in enumerate(reader.pages):
            # Attempt to extract embedded images
            if "/Resources" in page and "/XObject" in page["/Resources"]:
                x_objects = page["/Resources"]["/XObject"].get_object()
                for obj_name in x_objects:
                    obj = x_objects[obj_name]
                    if obj["/Subtype"] == "/Image":
                        try:
                            if "/Filter" in obj:
                                raw_data = obj.get_data()
                                img_array = np.frombuffer(raw_data, dtype=np.uint8)
                                import cv2  # type: ignore
                                img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                                if img is not None:
                                    images.append(img)
                        except Exception:  # noqa: BLE001
                            pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("PDF image extraction fallback failed: %s", exc)

    return images


def _load_image(file_bytes: bytes, content_type: str) -> list["np.ndarray"]:
    """Load file bytes into a list of numpy image arrays (one per page for PDFs)."""
    if content_type == "application/pdf":
        return _pdf_to_images(file_bytes)

    # Single image file
    try:
        from PIL import Image  # type: ignore
        img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        return [np.array(img)]
    except Exception as exc:
        raise ValueError(f"Could not decode image: {exc}") from exc


# ---------------------------------------------------------------------------
# Core processing function (runs in thread pool)
# ---------------------------------------------------------------------------

def _process_file_sync(task_id: str, file_bytes: bytes, content_type: str) -> None:
    """
    Synchronous OCR processing function — executed in ThreadPoolExecutor.
    Updates _task_store with progress and final result.
    """
    task = _task_store.get(task_id)
    if not task:
        return

    task.status = TaskStatus.PROCESSING
    logger.info("OCR processing started for task_id=%s", task_id)

    try:
        images = _load_image(file_bytes, content_type)
        task.total_pages = len(images)

        pages: list[PageResult] = []
        for page_idx, img_array in enumerate(images):
            page_num = page_idx + 1
            t0 = time.monotonic()
            logger.info("Processing page %d / %d", page_num, len(images))

            ocr_lines = _ocr_engine.run_ocr(img_array)
            extracted_fields, table_rows = _extract_fields_from_lines(ocr_lines, page_num)

            raw_text_lines = [
                item[1][0] for item in ocr_lines if item and len(item) >= 2
            ]

            elapsed_ms = int((time.monotonic() - t0) * 1000)
            pages.append(PageResult(
                page_number=page_num,
                raw_text_lines=raw_text_lines,
                extracted_fields=extracted_fields,
                table_rows=table_rows,
                processing_time_ms=elapsed_ms,
            ))

        task.pages = pages
        task.summary = _build_summary(pages)
        task.status = TaskStatus.COMPLETED
        task.completed_at = time.time()
        logger.info(
            "OCR task %s COMPLETED: %d pages, %d fields extracted.",
            task_id, len(pages), task.summary.get("total_fields_extracted", 0),
        )

    except Exception as exc:  # noqa: BLE001
        logger.error("OCR task %s FAILED: %s", task_id, exc, exc_info=True)
        task.status = TaskStatus.FAILED
        task.error_message = str(exc)
        task.completed_at = time.time()


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="GridIntel OCR Microservice",
    description=(
        "Standalone OCR service for BPDB power sector document processing. "
        "Extracts Plant, Month, MeterNumber, Readings, CF, and OMF fields "
        "from PDF and image files using PaddleOCR."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Lock down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "GridIntel OCR Microservice",
        "version": "1.0.0",
    }


# ---------------------------------------------------------------------------
# POST /ocr/process
# ---------------------------------------------------------------------------

@app.post(
    "/ocr/process",
    tags=["OCR"],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a PDF or image file for OCR processing",
    response_description="Returns a unique task_id for tracking extraction progress.",
)
async def process_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="PDF or image file to process"),
) -> JSONResponse:
    """
    Accept a multi-page PDF or single/multi-page image file.
    Queues OCR extraction asynchronously via background threads.
    Returns a unique `task_id` to track progress.

    Supported formats: PDF, JPEG, PNG, TIFF, BMP, WebP
    """
    # Validate content type
    content_type = file.content_type or ""
    if content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type: '{content_type}'. "
                f"Supported: {sorted(SUPPORTED_CONTENT_TYPES)}"
            ),
        )

    # Read and validate file size
    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size {size_mb:.1f}MB exceeds maximum {MAX_FILE_SIZE_MB}MB.",
        )

    # Create task record
    task_id = str(uuid.uuid4())
    task = OCRTaskResult(
        task_id=task_id,
        status=TaskStatus.PENDING,
        file_name=file.filename or "unknown",
        total_pages=0,
        pages=[],
        summary={},
        created_at=time.time(),
        completed_at=None,
        error_message=None,
    )
    _task_store[task_id] = task

    # Submit processing to thread pool via background task
    loop = asyncio.get_event_loop()
    background_tasks.add_task(
        _run_in_executor, loop, task_id, file_bytes, content_type
    )

    logger.info(
        "OCR task %s queued for file '%s' (%.2f MB, type=%s).",
        task_id, file.filename, size_mb, content_type,
    )

    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "task_id": task_id,
            "status": TaskStatus.PENDING.value,
            "file_name": file.filename,
            "file_size_mb": round(size_mb, 3),
            "message": "File queued for OCR processing. Poll /ocr/status/{task_id} for updates.",
            "status_url": f"/ocr/status/{task_id}",
            "result_url": f"/ocr/result/{task_id}",
        },
    )


async def _run_in_executor(
    loop: asyncio.AbstractEventLoop,
    task_id: str,
    file_bytes: bytes,
    content_type: str,
) -> None:
    """Offload synchronous OCR processing to the thread pool executor."""
    await loop.run_in_executor(
        _executor,
        _process_file_sync,
        task_id,
        file_bytes,
        content_type,
    )


# ---------------------------------------------------------------------------
# GET /ocr/status/{task_id}
# ---------------------------------------------------------------------------

@app.get(
    "/ocr/status/{task_id}",
    tags=["OCR"],
    summary="Get tracking state of an OCR task",
)
async def get_task_status(task_id: str) -> JSONResponse:
    """
    Returns the current tracking state for a task:
    - `PENDING`    — Queued, not yet started
    - `PROCESSING` — Currently running OCR inference
    - `COMPLETED`  — Extraction finished; call /ocr/result/{task_id} for data
    - `FAILED`     — Processing failed; error_message contains reason
    """
    task = _get_task(task_id)
    response: dict[str, Any] = {
        "task_id": task.task_id,
        "status": task.status.value,
        "file_name": task.file_name,
        "total_pages": task.total_pages,
        "created_at": task.created_at,
        "completed_at": task.completed_at,
    }
    if task.status == TaskStatus.PROCESSING:
        response["pages_completed"] = len(task.pages)
    if task.status == TaskStatus.FAILED:
        response["error_message"] = task.error_message
    if task.status == TaskStatus.COMPLETED:
        response["result_url"] = f"/ocr/result/{task_id}"
        response["processing_time_s"] = round(
            (task.completed_at or task.created_at) - task.created_at, 2
        )

    return JSONResponse(content=response)


# ---------------------------------------------------------------------------
# GET /ocr/result/{task_id}
# ---------------------------------------------------------------------------

@app.get(
    "/ocr/result/{task_id}",
    tags=["OCR"],
    summary="Retrieve structured OCR extraction results",
)
async def get_task_result(task_id: str) -> JSONResponse:
    """
    Returns the full structured JSON payload from completed OCR extraction.

    The payload includes:
    - `summary`: High-level extracted values (Plant, Month, MeterNumber, CF, OMF, Readings)
    - `pages`: Per-page detailed results with bounding boxes, raw text, and table rows
    - `metadata`: Task info, processing time, confidence stats

    Returns 404 if task not found, 409 if task is not yet completed.
    """
    task = _get_task(task_id)

    if task.status == TaskStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Task is still PENDING. Check /ocr/status/{task_id}.",
        )
    if task.status == TaskStatus.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Task is PROCESSING ({len(task.pages)}/{task.total_pages} pages done).",
        )
    if task.status == TaskStatus.FAILED:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "task_id": task_id,
                "status": "FAILED",
                "error": task.error_message,
                "summary": {},
                "pages": [],
            },
        )

    # Build serialisable page results
    pages_out = []
    for page in task.pages:
        fields_out = []
        for f in page.extracted_fields:
            fields_out.append({
                "field_name": f.field_name,
                "raw_text": f.raw_text,
                "normalized_value": f.normalized_value,
                "confidence": round(f.confidence, 4),
                "bounding_box": f.bounding_box,
                "page_number": f.page_number,
            })
        pages_out.append({
            "page_number": page.page_number,
            "raw_text_lines": page.raw_text_lines,
            "extracted_fields": fields_out,
            "table_rows": page.table_rows,
            "processing_time_ms": page.processing_time_ms,
        })

    return JSONResponse(
        content={
            "task_id": task_id,
            "status": "COMPLETED",
            "file_name": task.file_name,
            "summary": task.summary,
            "pages": pages_out,
            "metadata": {
                "total_pages": task.total_pages,
                "created_at": task.created_at,
                "completed_at": task.completed_at,
                "processing_time_s": round(
                    (task.completed_at or task.created_at) - task.created_at, 2
                ),
                "total_fields_extracted": task.summary.get("total_fields_extracted", 0),
                "avg_confidence": round(task.summary.get("avg_confidence", 0.0), 4),
            },
        }
    )


# ---------------------------------------------------------------------------
# GET /ocr/tasks  (admin listing endpoint)
# ---------------------------------------------------------------------------

@app.get("/ocr/tasks", tags=["Admin"], summary="List all OCR tasks (admin)")
async def list_tasks(limit: int = 50) -> JSONResponse:
    """List recent OCR tasks ordered by creation time descending."""
    tasks = sorted(_task_store.values(), key=lambda t: t.created_at, reverse=True)[:limit]
    return JSONResponse(
        content={
            "total": len(_task_store),
            "tasks": [
                {
                    "task_id": t.task_id,
                    "status": t.status.value,
                    "file_name": t.file_name,
                    "total_pages": t.total_pages,
                    "created_at": t.created_at,
                    "completed_at": t.completed_at,
                }
                for t in tasks
            ],
        }
    )


# ---------------------------------------------------------------------------
# DELETE /ocr/tasks/{task_id}
# ---------------------------------------------------------------------------

@app.delete("/ocr/tasks/{task_id}", tags=["Admin"], summary="Delete a task record")
async def delete_task(task_id: str) -> JSONResponse:
    task = _get_task(task_id)
    if task.status == TaskStatus.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a task that is currently PROCESSING.",
        )
    del _task_store[task_id]
    return JSONResponse(content={"deleted": True, "task_id": task_id})


# ---------------------------------------------------------------------------
# Application startup/shutdown events
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_event() -> None:
    logger.info("GridIntel OCR Microservice starting up...")
    logger.info("Temp directory: %s", TEMP_DIR)
    logger.info("Max file size: %d MB", MAX_FILE_SIZE_MB)
    logger.info("Thread pool workers: %d", _executor._max_workers)
    # Pre-warm PaddleOCR model (optional — comment out to skip slow startup)
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, _ocr_engine._ensure_initialized)
        logger.info("PaddleOCR model pre-warmed.")
    except Exception as exc:  # noqa: BLE001
        logger.warning("PaddleOCR pre-warm failed (will init on first request): %s", exc)


@app.on_event("shutdown")
async def shutdown_event() -> None:
    logger.info("GridIntel OCR Microservice shutting down...")
    _executor.shutdown(wait=True)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        workers=1,
        log_level="info",
    )
