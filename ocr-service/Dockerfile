# GridIntel OCR Microservice — Dockerfile

# ── Stage 1: Base OS + System dependencies ──────────────────────────────────
FROM python:3.11-slim-bookworm AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    libgomp1 \
    libjpeg62-turbo \
    libpng16-16 \
    libtiff6 \
    libwebp7 \
    poppler-utils \
    fonts-liberation \
    fonts-freefont-ttf \
    curl \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Stage 2: Python dependencies ─────────────────────────────────────────────
FROM base AS builder

WORKDIR /install

COPY requirements.txt .

RUN pip install --upgrade pip setuptools wheel \
    && pip install paddlepaddle==2.6.1 -f https://www.paddlepaddle.org.cn/whl/linux/mkl/avx/stable.html \
    || pip install paddlepaddle-cpu \
    && pip install --requirement requirements.txt

# ── Stage 3: Final runtime image ─────────────────────────────────────────────
FROM base AS runtime

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY main.py .

RUN mkdir -p /tmp/ocr_uploads /root/.paddleocr

# Pre-download PaddleOCR models
# PaddleOCR models will auto-download on first use

RUN groupadd -r ocr && useradd -r -g ocr -d /app -s /sbin/nologin ocr \
    && chown -R ocr:ocr /app /tmp/ocr_uploads

USER ocr

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["python", "-m", "uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8001", \
     "--workers", "1", \
     "--log-level", "info", \
     "--access-log"]