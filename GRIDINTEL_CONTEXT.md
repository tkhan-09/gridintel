# GridIntel — Project Context File
> এই file টা নতুন Claude session এ upload করুন। Claude তখন project সম্পর্কে সব বুঝবে।

---

## Project Overview
**GridIntel** — Bangladesh Power Development Board (BPDB) এর জন্য একটি Power Sector Intelligence Platform।

**Stack:**
- Frontend: Next.js 14, Tailwind CSS, Docker (dev mode, volume mount `./frontend:/app`)
- Backend: FastAPI (Python), SQLAlchemy async, Uvicorn
- Database: PostgreSQL 15 + pgvector (vector similarity search)
- AI: Groq `llama-3.3-70b` (LLM) + Gemini `gemini-embedding-001` (768-dim embeddings)
- Cache: Redis
- Docker services: `gridintel_frontend` (3000), `gridintel_backend` (8000), `gridintel_db` (5432), `gridintel_redis` (6379), `gridintel_ocr` (8001), `gridintel_worker`

**Important paths:**
- Root: `E:\AI Projects\gridintel\`
- Backend: `backend/app/`
- Frontend: `frontend/src/app/`
- Env: `.env` (root) — `GROQ_API_KEY`, `GEMINI_API_KEY`, `POSTGRES_*`
- Requirements: `requirements.txt` (root) — `pymupdf`, `requests`

---

## Backend API Map
**Base URL:** `http://localhost:8000/api/v1`

### `auth_and_analytics.py` → `/api/v1/auth` + `/api/v1/analytics`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | JWT login (username/password) |
| `/auth/refresh` | POST | Token refresh |
| `/auth/me` | GET | Current user info |
| `/analytics/dashboard` | GET | KPI cards, trends |
| `/analytics/company` | GET | Company-wise generation analytics |
| `/analytics/voltage` | GET | Voltage-level analytics |

### `billing_and_system.py` → Multiple routers
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/billing/` | GET/POST | Billing records |
| `/billing/{id}` | GET/PUT/DELETE | Single billing record |
| `/plants/` | GET | List all plants (full data) |
| `/plants/{id}` | GET/POST/PUT/DELETE | Plant CRUD |
| `/meters/` | GET | List all meters |
| `/meters/{id}` | GET/POST/PUT/DELETE | Meter CRUD |
| `/users/` | GET/POST | User management (Admin only) |
| `/users/{id}` | GET/PUT/DELETE | Single user |
| `/audit/` | GET | Audit trail |
| `/reports/` | GET/POST | Reports |
| `/anomalies/` | GET | Anomaly alerts |
| `/forecasts/` | GET | Forecast data |
| `/adjustments/` | GET/POST | Post-lock adjustments |
| `/notifications/` | GET | Notifications |
| `/notifications/ws` | WebSocket | Real-time alerts |

### `mod_and_operations.py` → `/api/v1/mod` + `/api/v1/cross-border` + `/api/v1/utility-sales`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mod/readings` | GET | MOD ledger rows |
| `/mod/save-draft` | POST | Bulk save draft readings |
| `/mod/submit` | POST | Submit readings |
| `/mod/verify` | POST | Verify submissions |
| `/mod/lock` | POST | Lock month |
| `/cross-border/circuits` | GET/POST | Cross-border circuits |
| `/cross-border/readings` | GET/POST | Cross-border readings |
| `/utility-sales/` | GET/POST/PUT/DELETE | Utility sales allocations |

### `copilot.py` → `/api/v1/copilot`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/copilot/chat` | POST | AI chat (RAG + Groq/Gemini fallback) |

### `rag.py` → `/api/v1/rag`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/rag/upload` | POST | Upload PDF/TXT/MD → embed |
| `/rag/documents` | GET | List documents |
| `/rag/documents/{id}` | DELETE | Delete document |
| `/rag/search` | GET | Vector similarity search |

### `offices_companies.py` → `/api/v1/offices` + `/api/v1/companies`
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/offices/` | GET | List offices (stub) |
| `/companies/` | GET | List companies (stub) |

---

## Database Tables (Key ones)
| Table | Key Columns |
|-------|-------------|
| `plants` | `id`, `name`, `capacity_mw`, `fuel_type`, `technology`, `ownership`, `sector`, `grid_voltage`, `office_id`, `status` |
| `meters` | `id`, `meter_code`, `meter_type`, `plant_id`, `location`, `is_active` |
| `rag_documents` | `id`, `title`, `content`, `doc_type`, `file_path`, `uploaded_at`, `embedding vector(768)`, `chunk_count` |
| `users` | `id`, `username`, `email`, `hashed_password`, `role_id`, `office_id`, `is_active` |
| `roles` | `id`, `name` — values: `operator`, `auditor`, `manager`, `admin`, `SuperAdmin` |
| `mod_readings` | `id`, `plant_id`, `month`, `year`, `status`, `gross_gen_kwh`, `active_energy_kwh` |
| `mod_submissions` | `id`, `plant_id`, `month`, `year`, `status` |
| `billing` | `id`, `utility_id`, `month`, `year`, `status` |
| `cross_border_circuits` | `id`, `name`, `voltage_level`, `direction`, `is_active` |
| `offices` | `id`, `name` |

**DB enums:**
- `rag_doc_type_enum`: `Policy`, `Manual`, `Regulation`, `TariffOrder`
- Plant status: `Active`, `Inactive`, `Under Maintenance`, `Decommissioned`
- Auth role stored as mixed case: `SuperAdmin`

---

## Frontend Pages Map
**Base:** `frontend/src/app/(dashboard)/`

| Page/Route | File | Connected API |
|------------|------|---------------|
| `/dashboard` | `dashboard/page.tsx` | `/analytics/dashboard` |
| `/plants` | `plants/page.tsx` | `/plants/` |
| `/meters` | `meters/page.tsx` | `/meters/` |
| `/mod-entry` | `mod-entry/page.tsx` | `/mod/readings`, `/mod/save-draft` |
| `/submissions` | `submissions/page.tsx` | `/mod/submit`, `/mod/verify` |
| `/generation-management` | `generation-management/page.tsx` | `/analytics/*` |
| `/cross-border` | `cross-border/page.tsx` | `/cross-border/*` |
| `/energy-accounting` | `energy-accounting/page.tsx` | `/billing/*` |
| `/master-data` | `master-data/page.tsx` | `/rag/*`, `/plants/`, `/meters/` |
| `/copilot` | `copilot/page.tsx` | `/copilot/chat` |
| `/settings` | `settings/page.tsx` | `/users/*` (Admin) |

**Auth:** `frontend/src/store/global_stores.ts` — `gridintel-auth` localStorage key, role: `SuperAdmin`
**API Client:** `frontend/src/lib/api_client.ts` — baseURL includes `/api/v1`, trailing slash on plants `/plants/`

---

## AI/RAG Pipeline
```
PDF Upload → extract_text() (pymupdf) → chunk_text() (500 chars, 50 overlap)
→ get_embedding() (Gemini gemini-embedding-001, 768-dim, L2 normalized, RETRIEVAL_DOCUMENT)
→ INSERT INTO rag_documents (embedding vector(768), chunk_count)

Query → get_query_embedding() (Gemini, RETRIEVAL_QUERY)
→ SELECT ... ORDER BY embedding <=> vector (cosine distance)
→ context → Groq llama-3.3-70b → response
```

---

## Key Files
```
backend/
  app/
    main.py                    ← Router registration
    api/v1/
      auth_and_analytics.py   ← Auth + Analytics endpoints
      billing_and_system.py   ← Plants, Meters, Billing, Users, Reports
      mod_and_operations.py   ← MOD workflow, Cross-border, Utility sales
      copilot.py              ← AI chat endpoint
      rag.py                  ← RAG upload/search
      offices_companies.py    ← Offices/Companies (stub)
    models/                   ← SQLAlchemy ORM models
    schemas/
      plant.py                ← PlantOut, PlantCreate, PlantUpdate
      meter.py                ← MeterOut etc.
      schemas.py              ← Auth, Analytics schemas
    services/
      billing_service.py
      audit_service.py
      notification_service.py
    workers/
      arq_worker.py           ← Background jobs

frontend/src/app/(dashboard)/
  master-data/page.tsx        ← RAG Hub + Plants + Meters tabs
  plants/page.tsx             ← Power Plants card view
  copilot/page.tsx            ← AI Copilot chat
```

---

## Docker Commands
```powershell
# Start all
docker-compose up -d

# Restart backend (code change নিতে — volume mount আছে)
docker-compose restart backend

# Rebuild frontend (page.tsx change নিতে)
docker-compose build --no-cache frontend
docker-compose up -d frontend

# DB access
docker-compose exec db psql -U gridintel -d gridintel_db

# Logs
docker-compose logs backend --tail=20
docker-compose logs frontend --tail=20
```

---

## Known Issues / Notes
1. **Frontend hot reload সমস্যা** — `page.tsx` change করলে `docker-compose build --no-cache frontend` দিতে হয়
2. **`/plants/` trailing slash** — apiClient তে trailing slash দিতে হয়
3. **offices_companies.py** stub মাত্র — empty array return করে
4. **chunk_count** — শুধু প্রথম chunk এর embedding store হয়, সব chunk এর না
5. **Worker** (`gridintel_worker`) — Restarting loop এ আছে, fix করা হয়নি
