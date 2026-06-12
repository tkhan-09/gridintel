# GridIntel — Production Handbook
## Operational Reference Log v1.0 | BPDB Power Intelligence Platform

---

## TABLE OF CONTENTS

1. [Architecture Mapping](#1-architecture-mapping)
2. [Database ERD Manifest](#2-database-erd-manifest)
3. [API Route Matrix](#3-api-route-matrix)
4. [Runbook Execution](#4-runbook-execution)

---

## 1. ARCHITECTURE MAPPING

### 1.1 Directory Topology Index

```
gridinel/                              # Project root
├── docker-compose.yml                 # Multi-container orchestration
├── .env.example                       # Environment variable template
├── .gitignore
├── README.md
│
├── backend/                           # FastAPI application
│   ├── Dockerfile                     # Python 3.11-slim base image
│   ├── requirements.txt               # All Python dependencies
│   ├── alembic.ini                    # Migration config
│   ├── main.py                        # ASGI entry point, router mounting
│   └── app/
│       ├── core/
│       │   ├── config.py              # Pydantic Settings, env loading
│       │   ├── database.py            # AsyncEngine, session factory
│       │   ├── security.py            # JWT encode/decode, password hashing
│       │   ├── dependencies.py        # FastAPI Depends: get_db, get_current_user
│       │   └── exceptions.py          # HTTP exception handlers
│       ├── models/                    # SQLAlchemy ORM models (20 files)
│       │   ├── plant.py               # plants + omf_history
│       │   ├── meter.py               # meters
│       │   ├── meter_cf_history.py    # meter_cf_history
│       │   ├── mod_reading.py         # mod_readings
│       │   ├── mod_submission.py      # mod_submissions
│       │   ├── month_lock.py          # month_locks
│       │   ├── cross_border.py        # cross_border_import
│       │   ├── utility_sales.py       # utility_sales
│       │   ├── billing.py             # billing_records
│       │   ├── energy_balance.py      # energy_balance
│       │   ├── adjustment.py          # adjustments
│       │   ├── audit_log.py           # audit_log
│       │   ├── anomaly_alert.py       # anomaly_alerts
│       │   ├── notification.py        # notifications
│       │   ├── forecast.py            # forecasts
│       │   ├── report.py              # reports
│       │   ├── user.py                # users
│       │   ├── role.py                # roles
│       │   └── rag_document.py        # rag_documents + rag_embeddings
│       ├── schemas/                   # Pydantic v2 schemas (14 files)
│       ├── api/v1/                    # REST controllers (19 files)
│       ├── services/                  # Business logic layer (15 files)
│       ├── ai/
│       │   ├── copilot/               # Intent detection, routing, response building
│       │   ├── sql_ai/                # NL→SQL agent, validator, schema context
│       │   ├── rag/                   # Embedder, retriever, augmentor, document loader
│       │   ├── tools/                 # 8 callable tools (MOD gen, report, etc.)
│       │   └── llm/                   # Groq/Gemini/OpenRouter clients + fallback
│       ├── ocr/                       # PDF processing, PaddleOCR, table extraction
│       ├── parsers/                   # Excel parsers (BPDB MOD template format)
│       ├── workers/                   # ARQ async background workers (5 files)
│       └── utils/                     # Calculations, date helpers, exporters
│
├── frontend/                          # Next.js 14 App Router
│   ├── Dockerfile                     # Node 20 Alpine, multi-stage build
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── app/
│       │   ├── layout.tsx             # Root layout (font, providers)
│       │   ├── page.tsx               # Redirect → /dashboard
│       │   ├── (auth)/login/          # JWT login page
│       │   └── (dashboard)/           # Protected route group (23 pages)
│       │       ├── layout.tsx         # Dashboard shell: Sidebar + Topbar
│       │       ├── dashboard/         # KPI cards, Sankey, trend charts
│       │       ├── plants/            # Plant list + detail pages
│       │       ├── meters/            # Meter management + CF history
│       │       ├── mod/               # MOD entry form (month-based)
│       │       ├── submission/        # Submission status tracker
│       │       ├── cross-border/      # Circuit import/export
│       │       ├── energy-accounting/ # Energy balance + Sankey
│       │       ├── utility-sales/     # Utility comparison
│       │       ├── billing/           # Invoice & payment management
│       │       ├── analytics/         # 5 sub-pages: office/company/fuel/voltage/loss
│       │       ├── reports/           # Report generator
│       │       ├── adjustments/       # Locked-month adjustment workflow
│       │       ├── audit/             # Audit trail timeline
│       │       ├── import/            # Excel + PDF upload + OCR review
│       │       ├── ai-copilot/        # Bilingual AI chat workspace ← THIS FILE
│       │       ├── users/             # User management (Admin+)
│       │       └── settings/          # Thresholds, deadlines, notifications
│       ├── components/                # 40+ reusable React components
│       ├── store/                     # 5 Zustand stores
│       ├── hooks/                     # 5 custom React hooks
│       ├── lib/                       # api.ts, calculations.ts, formatters.ts
│       └── types/                     # TypeScript type definitions
│
├── ocr-service/                       # PaddleOCR microservice (Python, FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   └── paddle_ocr_engine.py
│
├── database/
│   ├── init.sql                       # Schema DDL + extensions
│   ├── seed_data.sql                  # 13 offices, 8 plants, real OMF values, admin user
│   └── indexes.sql                    # Performance indexes + pgvector HNSW index
│
└── docs/                              # You are here
    ├── architecture.md
    ├── api_reference.md
    ├── database_schema.md
    ├── deployment_guide.md
    ├── user_manual.md
    └── production_guide.md            # This file
```

---

### 1.2 Docker Multi-Container Isolated Network Specification

```yaml
# Network: gridinel-network (bridge driver, isolated)
# All inter-service communication uses service names as hostnames

Services & Port Bindings:
┌─────────────────────┬────────────────────────────┬──────────────┬───────────────────────────┐
│ Service Name        │ Image / Build               │ Host Port    │ Internal Network Port     │
├─────────────────────┼────────────────────────────┼──────────────┼───────────────────────────┤
│ gridinel-frontend   │ ./frontend (Node 20)        │ 3000:3000    │ 3000                      │
│ gridinel-backend    │ ./backend (Python 3.11)     │ 8000:8000    │ 8000                      │
│ gridinel-db         │ pgvector/pgvector:pg15       │ 5432:5432    │ 5432                      │
│ gridinel-ocr        │ ./ocr-service (Python 3.10) │ 8001:8001    │ 8001                      │
│ gridinel-redis      │ redis:7-alpine              │ 6379:6379    │ 6379                      │
│ gridinel-worker     │ ./backend (ARQ entry)       │ (none)       │ internal only             │
└─────────────────────┴────────────────────────────┴──────────────┴───────────────────────────┘

Dependency Chain:
  gridinel-db (healthcheck: pg_isready)
       ↓
  gridinel-backend (depends_on: db healthy, redis healthy)
  gridinel-worker  (depends_on: db healthy, redis healthy)
       ↓
  gridinel-frontend (depends_on: backend)
  gridinel-ocr      (independent — no DB dependency)

Volume Mounts:
  gridinel-postgres-data  → /var/lib/postgresql/data  (persistent)
  gridinel-redis-data     → /data                     (persistent)
  ./backend/reports       → /app/reports              (report outputs)
  ./backend/uploads       → /app/uploads              (uploaded files)

Network Bridge Config:
  driver: bridge
  name: gridinel-network
  ipam:
    driver: default
    config:
      - subnet: 172.28.0.0/16

Internal DNS Resolution (examples):
  gridinel-backend → http://gridinel-backend:8000
  gridinel-db      → postgresql+asyncpg://gridinel-db:5432/gridinel_db
  gridinel-redis   → redis://gridinel-redis:6379
  gridinel-ocr     → http://gridinel-ocr:8001
```

---

## 2. DATABASE ERD MANIFEST

### 2.1 Complete Data Definitions Sheet

#### Core Reference Tables

```sql
-- ROLES (5 fixed roles)
roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(20) NOT NULL UNIQUE,  -- SuperAdmin/Admin/Operator/Auditor/Viewer
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
)

-- USERS
users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role_id       UUID NOT NULL REFERENCES roles(id),
  office_id     UUID REFERENCES offices(id),  -- NULL = system-wide access
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
)

-- OFFICES (13 BPDB regional offices)
offices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  code       VARCHAR(20) NOT NULL UNIQUE,
  region     VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- FUEL TYPES (7 types)
fuel_types (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE  -- Natural Gas, Coal, Furnace Oil, Diesel, HFO, Hydro, Solar
)
```

#### Plant & Meter Tables

```sql
-- PLANTS (8 BPDB plants)
plants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  installed_capacity_mw DECIMAL(10,2) NOT NULL,
  derated_capacity_mw   DECIMAL(10,2),
  fuel_type_id          UUID REFERENCES fuel_types(id),
  voltage_level_kv      INTEGER,   -- 132, 230, 400
  company               VARCHAR(100),
  office_id             UUID REFERENCES offices(id),
  plant_type            VARCHAR(20) CHECK (plant_type IN ('thermal','ccpp','hydro','solar')),
  status                VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive')),
  omf                   DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  omf_effective_date    DATE,
  omf_changed_by        UUID REFERENCES users(id),
  omf_previous          DECIMAL(5,4),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
)

-- OMF_HISTORY ← CRITICAL: tracks every OMF change with full audit trail
omf_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id      UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  omf_value     DECIMAL(5,4) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE,            -- NULL means currently active
  changed_by    UUID NOT NULL REFERENCES users(id),
  change_reason TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
)
-- Index: CREATE INDEX idx_omf_history_plant ON omf_history(plant_id, effective_from DESC);
-- Business rule: When effective_to IS NULL → this is the current active OMF for that plant.
-- On every OMF update: SET effective_to = NOW() for old record, INSERT new record with effective_to = NULL.

-- METERS
meters (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id             UUID NOT NULL REFERENCES plants(id),
  meter_number         VARCHAR(50) NOT NULL,
  meter_type           VARCHAR(20) CHECK (meter_type IN ('Export','Import','GT','ST','Auxiliary')),
  ct_ratio             DECIMAL(10,4),
  cf                   DECIMAL(10,6) NOT NULL DEFAULT 1.000000,
  omf                  DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  direction            VARCHAR(10) CHECK (direction IN ('forward','reverse')),
  status               VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','replaced')),
  installation_date    DATE,
  replacement_date     DATE,
  replaced_by_meter_id UUID REFERENCES meters(id),  -- self-referencing FK
  created_at           TIMESTAMPTZ DEFAULT NOW()
)

-- METER_CF_HISTORY
meter_cf_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id        UUID NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  old_cf          DECIMAL(10,6) NOT NULL,
  new_cf          DECIMAL(10,6) NOT NULL,
  changed_at      TIMESTAMPTZ DEFAULT NOW(),
  changed_by      UUID NOT NULL REFERENCES users(id),
  reason          TEXT,
  effective_month INTEGER CHECK (effective_month BETWEEN 1 AND 12),
  effective_year  INTEGER
)
```

#### MOD & Operational Tables

```sql
-- MOD_READINGS (core measurement table)
mod_readings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id              UUID NOT NULL REFERENCES plants(id),
  meter_id              UUID REFERENCES meters(id),
  month                 INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                  INTEGER NOT NULL,
  previous_reading      DECIMAL(12,4),
  current_reading       DECIMAL(12,4),
  -- Computed columns (maintained by application layer):
  gross_generation      DECIMAL(12,4),     -- (curr-prev)*cf*omf
  self_auxiliary        DECIMAL(12,4),
  grid_auxiliary        DECIMAL(12,4),
  total_station_use     DECIMAL(12,4),     -- self_aux + grid_aux
  net_generation        DECIMAL(12,4),     -- gross - total_station_use
  corrected_generation  DECIMAL(12,4),     -- = net_generation (omf already applied)
  cf                    DECIMAL(10,6),     -- snapshot of cf at time of reading
  omf                   DECIMAL(5,4),      -- snapshot of omf at time of reading
  auxiliary_percent     DECIMAL(6,3),      -- (station_use/gross)*100
  gt_generation         DECIMAL(12,4),     -- CCPP only (Gas Turbine)
  st_generation         DECIMAL(12,4),     -- CCPP only (Steam Turbine)
  gt_ratio              DECIMAL(5,4),      -- CCPP only: gt/(gt+st)
  remarks               TEXT,
  created_by            UUID REFERENCES users(id),
  updated_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (plant_id, meter_id, month, year)
)

-- MOD_SUBMISSIONS
mod_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id     UUID NOT NULL REFERENCES plants(id),
  month        INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         INTEGER NOT NULL,
  status       VARCHAR(20) DEFAULT 'Draft'
               CHECK (status IN ('Draft','Submitted','Verified','Locked')),
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  verified_by  UUID REFERENCES users(id),
  verified_at  TIMESTAMPTZ,
  is_late      BOOLEAN DEFAULT FALSE,
  late_reason  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (plant_id, month, year)
)

-- MONTH_LOCKS
month_locks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month          INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year           INTEGER NOT NULL,
  is_locked      BOOLEAN DEFAULT FALSE,
  locked_by      UUID REFERENCES users(id),
  locked_at      TIMESTAMPTZ,
  unlock_reason  TEXT,
  unlocked_by    UUID REFERENCES users(id),
  unlocked_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (month, year)
)
```

#### Financial & Energy Tables

```sql
-- CROSS_BORDER_IMPORT (India circuits)
cross_border_import (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circuit_name       VARCHAR(100) NOT NULL,
  -- Valid: Baharampur HVC 400KV, Comilla South Ckt-1, Comilla South Ckt-2, Tripura 132KV
  month              INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year               INTEGER NOT NULL,
  import_mu          DECIMAL(12,4) DEFAULT 0,
  export_mu          DECIMAL(12,4) DEFAULT 0,
  net_import_mu      DECIMAL(12,4) GENERATED ALWAYS AS (import_mu - export_mu) STORED,
  availability_hours DECIMAL(6,2),
  outage_hours       DECIMAL(6,2),
  outage_reason      TEXT,
  source_country     VARCHAR(50) DEFAULT 'India',
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (circuit_name, month, year)
)

-- UTILITY_SALES
utility_sales (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utility_name VARCHAR(50) NOT NULL,
  -- Valid: BPDB, DPDC, DESCO, NESCO, PBS, WZPDCL
  month        INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         INTEGER NOT NULL,
  sales_mu     DECIMAL(12,4) NOT NULL,
  share_percent DECIMAL(5,2),  -- computed: sales_mu / total_sales * 100
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (utility_name, month, year)
)

-- BILLING_RECORDS
billing_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utility_name         VARCHAR(50) NOT NULL,
  month                INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                 INTEGER NOT NULL,
  billed_unit_mu       DECIMAL(12,4),
  billing_amount_bdt   DECIMAL(15,2),
  ait_bdt              DECIMAL(15,2) DEFAULT 0,
  vat_bdt              DECIMAL(15,2) DEFAULT 0,
  net_bill_bdt         DECIMAL(15,2) GENERATED ALWAYS AS
                         (billing_amount_bdt + ait_bdt + vat_bdt) STORED,
  invoice_number       VARCHAR(50),
  invoice_date         DATE,
  due_date             DATE,
  payment_status       VARCHAR(20) DEFAULT 'Pending'
                       CHECK (payment_status IN ('Pending','Partial','Paid','Overdue')),
  paid_amount_bdt      DECIMAL(15,2) DEFAULT 0,
  outstanding_bdt      DECIMAL(15,2) GENERATED ALWAYS AS
                         (net_bill_bdt - paid_amount_bdt) STORED,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
)

-- ENERGY_BALANCE (auto-computed monthly summary)
energy_balance (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month                     INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                      INTEGER NOT NULL,
  total_generation_mu       DECIMAL(12,4),
  cross_border_net_import_mu DECIMAL(12,4),
  available_energy_mu       DECIMAL(12,4),  -- generation + net_import
  total_sales_mu            DECIMAL(12,4),
  system_loss_mu            DECIMAL(12,4),  -- available - sales
  loss_percent              DECIMAL(5,2),   -- (loss/available)*100
  technical_loss_mu         DECIMAL(12,4),
  commercial_loss_mu        DECIMAL(12,4),
  other_loss_mu             DECIMAL(12,4),
  calculated_at             TIMESTAMPTZ DEFAULT NOW(),
  calculated_by             UUID REFERENCES users(id),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (month, year)
)
```

#### Governance & Intelligence Tables

```sql
-- ADJUSTMENTS (post-lock data corrections)
adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name VARCHAR(50) NOT NULL,  -- mod_readings, billing_records, etc.
  record_id   UUID NOT NULL,
  month       INTEGER CHECK (month BETWEEN 1 AND 12),
  year        INTEGER,
  field_name  VARCHAR(100) NOT NULL,
  old_value   TEXT,
  new_value   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  status      VARCHAR(20) DEFAULT 'Pending'
              CHECK (status IN ('Pending','Approved','Rejected')),
  created_by  UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
)

-- AUDIT_LOG (immutable — INSERT ONLY, no UPDATE/DELETE)
audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  action     VARCHAR(20) NOT NULL,  -- CREATE, UPDATE, DELETE, LOGIN, EXPORT
  module     VARCHAR(50) NOT NULL,
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
-- Index: CREATE INDEX idx_audit_log_user_module ON audit_log(user_id, module, created_at DESC);
-- Index: CREATE INDEX idx_audit_log_created ON audit_log USING BRIN(created_at);

-- ANOMALY_ALERTS
anomaly_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type       VARCHAR(30) NOT NULL CHECK (alert_type IN (
                     'GenerationDrop','HighLoss','MissingReading','OMFChange',
                     'MeterAnomaly','CFChange','AuxiliarySpike','SubmissionOverdue')),
  severity         VARCHAR(10) NOT NULL CHECK (severity IN ('Info','Warning','Critical')),
  plant_id         UUID REFERENCES plants(id),
  message          TEXT NOT NULL,
  details          JSONB DEFAULT '{}',
  is_acknowledged  BOOLEAN DEFAULT FALSE,
  acknowledged_by  UUID REFERENCES users(id),
  acknowledged_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
)

-- NOTIFICATIONS
notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  type            VARCHAR(50),  -- DEADLINE, ANOMALY, SUBMISSION, SYSTEM
  is_read         BOOLEAN DEFAULT FALSE,
  related_module  VARCHAR(50),
  related_id      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)
-- Index: CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- FORECASTS
forecasts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_type    VARCHAR(20) CHECK (forecast_type IN
                     ('Generation','Sales','Loss','CrossBorder','Auxiliary')),
  plant_id         UUID REFERENCES plants(id),
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year             INTEGER NOT NULL,
  forecast_value   DECIMAL(12,4),
  confidence_percent DECIMAL(5,2),
  method_used      VARCHAR(50),  -- linear_regression, arima, llm_assisted
  actual_value     DECIMAL(12,4),
  created_at       TIMESTAMPTZ DEFAULT NOW()
)

-- REPORTS (async job tracking)
reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type   VARCHAR(50) NOT NULL,
  parameters    JSONB DEFAULT '{}',
  status        VARCHAR(20) DEFAULT 'Pending'
                CHECK (status IN ('Pending','Processing','Ready','Failed')),
  file_path     TEXT,
  file_format   VARCHAR(10) CHECK (file_format IN ('PDF','Excel')),
  requested_by  UUID REFERENCES users(id),
  requested_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  error_message TEXT
)
```

#### AI / RAG Tables

```sql
-- RAG_DOCUMENTS
rag_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(255) NOT NULL,
  content       TEXT NOT NULL,
  document_type VARCHAR(50),  -- policy, manual, standard, report
  source_file   TEXT,
  uploaded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
)

-- RAG_EMBEDDINGS ← pgvector table
rag_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  chunk_text  TEXT NOT NULL,
  embedding   vector(1536),   -- pgvector extension required
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
)
```

---

### 2.2 pgvector Index Declarations

```sql
-- Enable extensions (must run before all DDL)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- HNSW index for approximate nearest-neighbor search on embeddings
-- HNSW is preferred over IVFFlat for < 1M vectors (no training required)
CREATE INDEX idx_rag_embeddings_hnsw
  ON rag_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- IVFFlat index (alternative — use when vector count > 1M)
-- CREATE INDEX idx_rag_embeddings_ivfflat
--   ON rag_embeddings
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- Set search parameters at query time:
-- SET ivfflat.probes = 10;  -- for IVFFlat
-- SET hnsw.ef_search = 40;  -- for HNSW (higher = more accurate, slower)
```

---

### 2.3 omf_history Tracking Mechanism

The `omf_history` table implements full audit-trail versioning of the Outage Maintenance Factor for each power plant.

**Lifecycle:**

```
Initial Setup:
  INSERT INTO plants (omf = 0.9500, omf_effective_date = '2024-01-01')
  INSERT INTO omf_history (plant_id, omf_value=0.9500, effective_from='2024-01-01',
                           effective_to=NULL, changed_by=<admin_id>, change_reason='Initial setup')

OMF Change (e.g., after maintenance):
  BEGIN TRANSACTION;
    -- Step 1: Close current OMF record
    UPDATE omf_history
       SET effective_to = CURRENT_DATE
     WHERE plant_id = :plant_id AND effective_to IS NULL;

    -- Step 2: Insert new OMF record (becomes active)
    INSERT INTO omf_history (plant_id, omf_value=0.9200, effective_from=CURRENT_DATE,
                             effective_to=NULL, changed_by=:user_id,
                             change_reason='Post-overhaul recalibration');

    -- Step 3: Update plants table current value
    UPDATE plants
       SET omf = 0.9200,
           omf_effective_date = CURRENT_DATE,
           omf_previous = 0.9500,
           omf_changed_by = :user_id
     WHERE id = :plant_id;

    -- Step 4: Log to audit_log
    INSERT INTO audit_log (action='UPDATE', module='omf_history', ...)
  COMMIT;

Query active OMF for a plant:
  SELECT omf_value FROM omf_history
   WHERE plant_id = :plant_id AND effective_to IS NULL;

Query historical OMF for a specific month:
  SELECT omf_value FROM omf_history
   WHERE plant_id = :plant_id
     AND effective_from <= :month_end
     AND (effective_to IS NULL OR effective_to > :month_start)
   ORDER BY effective_from DESC
   LIMIT 1;
```

**Business Impact:** When a MOD reading is saved, the system snapshots the currently active OMF value into `mod_readings.omf`. This ensures historical recalculations remain accurate even after future OMF changes.

---

### 2.4 Performance Index Reference

```sql
-- mod_readings lookup (most frequent query)
CREATE INDEX idx_mod_readings_plant_month_year ON mod_readings(plant_id, month, year);
CREATE INDEX idx_mod_readings_month_year ON mod_readings(month, year);

-- Submission status dashboard
CREATE INDEX idx_mod_submissions_status ON mod_submissions(status, month, year);
CREATE INDEX idx_mod_submissions_plant ON mod_submissions(plant_id, month, year);

-- Energy balance time series
CREATE INDEX idx_energy_balance_period ON energy_balance(year DESC, month DESC);

-- Billing outstanding queries
CREATE INDEX idx_billing_status ON billing_records(payment_status, due_date);
CREATE INDEX idx_billing_utility ON billing_records(utility_name, month, year);

-- Anomaly alerts (unacknowledged fast path)
CREATE INDEX idx_anomaly_unacked ON anomaly_alerts(is_acknowledged, severity, created_at DESC)
  WHERE is_acknowledged = FALSE;

-- Audit log time-series (BRIN for append-only table)
CREATE INDEX idx_audit_log_brin ON audit_log USING BRIN(created_at);
CREATE INDEX idx_audit_log_module ON audit_log(module, created_at DESC);

-- OMF history active record lookup
CREATE INDEX idx_omf_history_active ON omf_history(plant_id, effective_to)
  WHERE effective_to IS NULL;

-- Cross border monthly
CREATE INDEX idx_cross_border_period ON cross_border_import(month, year, circuit_name);
```

---

## 3. API ROUTE MATRIX

### 3.1 REST Controllers (24 total)

All routes prefixed with `/api/v1`. JWT Bearer token required unless marked `[public]`.

#### Authentication — `auth.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/auth/login` | Obtain JWT access + refresh tokens | [public] |
| POST | `/auth/refresh` | Refresh access token | [public] |
| POST | `/auth/logout` | Invalidate refresh token | All |
| GET | `/auth/me` | Current user profile | All |
| POST | `/auth/forgot-password` | Send password reset email | [public] |
| POST | `/auth/reset-password/{token}` | Reset password with token | [public] |

#### Plants — `plants.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/plants` | List all plants (filter: office, status) | All |
| GET | `/plants/{id}` | Plant detail + current OMF | All |
| POST | `/plants` | Create plant | Admin+ |
| PUT | `/plants/{id}` | Update plant | Admin+ |
| PUT | `/plants/{id}/omf` | Update OMF (creates omf_history record) | Admin+ |
| GET | `/plants/{id}/omf-history` | Full OMF versioning log | All |
| GET | `/plants/{id}/generation-summary` | Monthly generation trend | All |

#### Meters — `meters.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/meters` | List meters (filter: plant_id, status) | All |
| GET | `/meters/{id}` | Meter detail | All |
| POST | `/meters` | Create meter | Admin+ |
| PUT | `/meters/{id}` | Update meter | Admin+ |
| PUT | `/meters/{id}/cf` | Update CF (creates cf_history record) | Admin+ |
| GET | `/meters/{id}/cf-history` | CF change log | All |
| POST | `/meters/{id}/replace` | Mark replaced, link new meter | Admin+ |

#### MOD Readings — `mod.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/mod` | List readings (filter: month, year, plant) | All |
| GET | `/mod/{plant_id}/{month}/{year}` | Single plant MOD detail | All |
| POST | `/mod` | Save/update MOD reading | Operator+ |
| POST | `/mod/bulk` | Bulk save from Excel import | Operator+ |
| GET | `/mod/previous/{plant_id}/{month}/{year}` | Fetch previous month closing reading | All |
| DELETE | `/mod/{id}` | Delete draft reading | Admin+ |

#### Submissions — `submission.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/submission` | Submission status board (month, year) | All |
| POST | `/submission/{plant_id}/submit` | Mark as Submitted | Operator+ |
| POST | `/submission/{plant_id}/verify` | Mark as Verified | Admin+ |
| GET | `/submission/overdue` | List overdue plants | All |

#### Month Lock — `month_lock.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/month-lock/{month}/{year}` | Check lock status | All |
| POST | `/month-lock/lock` | Lock month | SuperAdmin |
| POST | `/month-lock/unlock` | Unlock with reason | SuperAdmin |
| GET | `/month-lock/history` | Lock/unlock history | Admin+ |

#### Cross Border — `cross_border.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/cross-border` | List all circuits (filter: month, year) | All |
| POST | `/cross-border` | Create/update circuit entry | Operator+ |
| GET | `/cross-border/summary/{month}/{year}` | Net import summary | All |
| GET | `/cross-border/trend/{circuit}` | 12-month trend for circuit | All |

#### Utility Sales — `utility_sales.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/utility-sales` | List sales (month, year) | All |
| POST | `/utility-sales` | Create/update entry | Operator+ |
| GET | `/utility-sales/comparison` | Multi-utility comparison chart data | All |

#### Billing — `billing.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/billing` | Invoice list (filter: status, utility, month) | All |
| GET | `/billing/{id}` | Invoice detail | All |
| POST | `/billing` | Create invoice | Admin+ |
| PUT | `/billing/{id}` | Update payment status / amount | Admin+ |
| GET | `/billing/outstanding` | Overdue invoices with aging buckets | All |
| GET | `/billing/revenue-trend` | Monthly revenue trend | All |

#### Energy Balance — `energy_balance.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/energy-balance/{month}/{year}` | Monthly balance summary | All |
| POST | `/energy-balance/recalculate/{month}/{year}` | Trigger recalculation | Admin+ |
| GET | `/energy-balance/trend` | 12-month trend data | All |
| GET | `/energy-balance/sankey/{month}/{year}` | Sankey diagram data format | All |

#### Adjustments — `adjustments.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/adjustments` | List adjustments (filter: status, module, month) | Admin+ |
| POST | `/adjustments` | Submit adjustment request | Operator+ |
| PUT | `/adjustments/{id}/approve` | Approve and apply | Admin+ |
| PUT | `/adjustments/{id}/reject` | Reject with reason | Admin+ |

#### Audit — `audit.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/audit` | Audit log (filter: module, user, date range) | Auditor+ |
| GET | `/audit/{record_id}` | Audit trail for specific record | Auditor+ |

#### Anomalies — `anomalies.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/anomalies` | List alerts (filter: severity, type, acknowledged) | All |
| POST | `/anomalies/{id}/acknowledge` | Acknowledge alert | Operator+ |
| GET | `/anomalies/active-count` | Unacknowledged counts by severity | All |

#### Reports — `reports.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/reports` | List generated reports | All |
| POST | `/reports/generate` | Queue report generation (async ARQ) | All |
| GET | `/reports/{id}/download` | Download generated report file | All |
| GET | `/reports/{id}/status` | Poll generation status | All |

#### Analytics — `analytics.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/analytics/dashboard` | **All 6 KPI values in single call** | All |
| GET | `/analytics/office` | 13-office KPI comparison | All |
| GET | `/analytics/company` | Company-wise generation comparison | All |
| GET | `/analytics/fuel` | Fuel-type generation breakdown | All |
| GET | `/analytics/voltage` | Voltage-level analysis | All |
| GET | `/analytics/loss` | Loss trend + type breakdown | All |

#### Import — `import_excel.py` + `upload_pdf.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/import/excel` | Upload and parse BPDB MOD Excel template | Operator+ |
| POST | `/import/excel/validate` | Validate without saving | Operator+ |
| POST | `/import/pdf` | Upload PDF → OCR service | Operator+ |
| GET | `/import/pdf/{job_id}` | Poll OCR processing status | Operator+ |
| POST | `/import/pdf/{job_id}/confirm` | Confirm OCR results → save | Operator+ |

#### Users — `users.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/users` | List users | Admin+ |
| POST | `/users` | Create user | Admin+ |
| PUT | `/users/{id}` | Update user | Admin+ |
| PUT | `/users/{id}/activate` | Activate/deactivate | Admin+ |
| PUT | `/users/{id}/reset-password` | Admin password reset | Admin+ |

#### AI Copilot — `ai_copilot.py`
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/ai-copilot/chat` | Submit query → intent → route → response | All |
| POST | `/ai-copilot/stream` | SSE streaming chat response | All |
| GET | `/ai-copilot/history` | Fetch conversation history (session) | All |
| DELETE | `/ai-copilot/history` | Clear conversation history | All |

#### Notifications — `notifications.py` (bonus controller)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/notifications` | User's notification list | All |
| PUT | `/notifications/{id}/read` | Mark single as read | All |
| PUT | `/notifications/read-all` | Mark all as read | All |
| DELETE | `/notifications/{id}` | Delete notification | All |
| GET | `/notifications/unread-count` | Badge count | All |

---

### 3.2 WebSocket Live Notification Stream

```
Endpoint:   GET /api/v1/notifications/ws
Protocol:   WebSocket (ws:// or wss://)
Auth:       JWT token passed as query param: ?token=<access_token>
Purpose:    Real-time push of new notifications to connected frontend clients

Connection flow:
  1. Client connects: ws://localhost:8000/api/v1/notifications/ws?token=<jwt>
  2. Backend authenticates token, registers connection in Redis pub/sub channel
     keyed by user_id: channel = f"notifications:{user_id}"
  3. Backend sends immediate ping: {"type": "connected", "user_id": "..."}
  4. On any INSERT to notifications table for this user_id:
     - notification_service.py publishes to Redis channel
     - WebSocket handler receives from Redis, forwards JSON to client
  5. Client displays toast notification, increments bell badge
  6. On disconnect: deregister from Redis channel

Message format (JSON):
  {
    "type": "notification",
    "id": "uuid",
    "title": "MOD Submission Deadline",
    "body": "Ashuganj plant MOD submission due in 3 days",
    "notification_type": "DEADLINE",
    "related_module": "mod_submissions",
    "related_id": "uuid",
    "created_at": "2026-04-07T10:30:00Z"
  }

Implementation:
  - FastAPI: from fastapi import WebSocket
  - Redis pub/sub via aioredis
  - Connection manager class tracks active WebSocket connections
  - Heartbeat ping every 30s to detect stale connections
```

---

### 3.3 Background Task Processing Pipelines — `arq_worker.py`

ARQ is an async Python task queue backed by Redis. The worker process runs as a separate Docker container (`gridinel-worker`).

```python
# arq_worker.py — WorkerSettings
class WorkerSettings:
    functions = [
        generate_report_task,       # report_worker.py
        run_anomaly_scan_task,      # anomaly_worker.py
        run_forecast_task,          # forecast_worker.py
        send_deadline_notifications, # notification_worker.py
        recalculate_energy_balance, # recalculation_worker.py
    ]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    job_timeout = 300  # 5 minutes max per job
    keep_result = 3600  # retain result 1 hour
    cron_jobs = [
        cron(run_anomaly_scan_task, hour={*range(24)}, minute=0),   # hourly
        cron(send_deadline_notifications, hour=8, minute=0),         # daily 8AM
        cron(run_forecast_task, day=1, hour=2, minute=0),            # 1st of month
    ]
```

| Worker | Function | Trigger | Description |
|--------|----------|---------|-------------|
| `report_worker.py` | `generate_report_task` | On-demand (POST /reports/generate) | Generates PDF (ReportLab) or Excel (OpenPyXL) report, saves to /app/reports/, updates reports.status |
| `anomaly_worker.py` | `run_anomaly_scan_task` | Cron: hourly + on MOD save | Scans for GenerationDrop (>20%), HighLoss (>threshold%), MissingReading, AuxiliarySpike. Inserts anomaly_alerts records, publishes WebSocket notifications |
| `forecast_worker.py` | `run_forecast_task` | Cron: 1st of month 02:00 | Runs linear regression forecast on 12-month rolling window for each plant. Inserts forecasts table records |
| `notification_worker.py` | `send_deadline_notifications` | Cron: daily 08:00 | Checks submission deadlines: sends notifications at 7-day, 3-day, 1-day, overdue intervals. Uses `SUBMISSION_DEADLINE_DAY` setting |
| `recalculation_worker.py` | `recalculate_energy_balance` | On-demand (data change events) | Recalculates energy_balance for affected month. Triggered when mod_readings, cross_border_import, or utility_sales changes |

---

## 4. RUNBOOK EXECUTION

### 4.1 Production Build Instructions

#### Prerequisites
- Docker Engine ≥ 24.0
- Docker Compose Plugin ≥ 2.20
- 8 GB RAM minimum (PaddleOCR is memory-intensive)
- 20 GB free disk space

#### Environment Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/gridintel.git
cd gridintel

# 2. Create environment file from template
cp .env.example .env

# 3. Edit .env — set your API keys:
#    GROQ_API_KEY     → https://console.groq.com (free)
#    GEMINI_API_KEY   → https://aistudio.google.com (free)
#    OPENROUTER_API_KEY → https://openrouter.ai (free)
#    SECRET_KEY       → generate with: openssl rand -hex 32
nano .env
```

#### Full Production Build

```bash
# Build all 6 service images and start containers
# --build          → rebuilds images even if cached
# --force-recreate → recreates containers even if config unchanged
docker-compose up --build --force-recreate

# Run in background (detached mode)
docker-compose up --build --force-recreate -d

# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f gridinel-backend
docker-compose logs -f gridinel-worker
```

#### Verify All Services Online

```bash
# Check all containers are running
docker-compose ps

# Expected output:
# NAME                    STATUS    PORTS
# gridinel-frontend       Up        0.0.0.0:3000->3000/tcp
# gridinel-backend        Up        0.0.0.0:8000->8000/tcp
# gridinel-db             Up        0.0.0.0:5432->5432/tcp
# gridinel-ocr            Up        0.0.0.0:8001->8001/tcp
# gridinel-redis          Up        0.0.0.0:6379->6379/tcp
# gridinel-worker         Up        (no port binding)

# Health check endpoints
curl http://localhost:8000/health          # → {"status":"ok","db":"connected","redis":"connected"}
curl http://localhost:8001/health          # → {"status":"ok","ocr":"ready"}
curl http://localhost:3000                 # → 200 OK (Next.js app)
```

---

### 4.2 Initialization Checklist

Perform these steps after first `docker-compose up`:

```bash
# ── Database Initialization ─────────────────────────────────────────────────

# Step 1: Verify PostgreSQL extensions are installed
docker exec gridinel-db psql -U gridinel -d gridinel_db -c "\dx"
# Must show: pgvector, uuid-ossp

# Step 2: Run Alembic migrations (creates all tables)
docker exec gridinel-backend alembic upgrade head
# Expected: "INFO [alembic.runtime.migration] Running upgrade  -> <hash>"

# Step 3: Verify all tables created
docker exec gridinel-db psql -U gridinel -d gridinel_db -c "\dt"
# Must show 20+ tables including omf_history, rag_embeddings, month_locks

# Step 4: Verify pgvector index on rag_embeddings
docker exec gridinel-db psql -U gridinel -d gridinel_db \
  -c "SELECT indexname FROM pg_indexes WHERE tablename='rag_embeddings';"
# Must show: idx_rag_embeddings_hnsw

# ── Seed Data Loading ───────────────────────────────────────────────────────

# Step 5: Load seed data (offices, plants, fuel types, users)
docker exec gridinel-db psql -U gridinel -d gridinel_db -f /docker-entrypoint-initdb.d/seed_data.sql

# Or if seed file is outside container:
docker exec -i gridinel-db psql -U gridinel -d gridinel_db < database/seed_data.sql

# Step 6: Load performance indexes
docker exec -i gridinel-db psql -U gridinel -d gridinel_db < database/indexes.sql

# ── Verification ─────────────────────────────────────────────────────────────

# Step 7: Verify seed counts
docker exec gridinel-db psql -U gridinel -d gridinel_db -c "
  SELECT
    (SELECT COUNT(*) FROM offices)    AS offices,
    (SELECT COUNT(*) FROM plants)     AS plants,
    (SELECT COUNT(*) FROM fuel_types) AS fuel_types,
    (SELECT COUNT(*) FROM users)      AS users,
    (SELECT COUNT(*) FROM roles)      AS roles;
"
# Expected: offices=13, plants=8, fuel_types=7, users=1, roles=5

# Step 8: Verify default SuperAdmin user
docker exec gridinel-db psql -U gridinel -d gridinel_db -c "
  SELECT u.username, r.name as role, u.is_active
  FROM users u JOIN roles r ON u.role_id = r.id;
"
# Must show: admin | SuperAdmin | t

# Step 9: Test authentication
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@GridIntel2026!"}'
# Must return: {"access_token":"...","token_type":"bearer","expires_in":3600}

# Step 10: Test protected endpoint with token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@GridIntel2026!"}' | jq -r .access_token)

curl http://localhost:8000/api/v1/plants \
  -H "Authorization: Bearer $TOKEN"
# Must return JSON array with 8 plants
```

---

### 4.3 Master Data Seeding Validation Procedures

#### Validate All Seeded Reference Data

```sql
-- Run in: docker exec gridinel-db psql -U gridinel -d gridinel_db

-- ── 13 BPDB Regional Offices ──────────────────────────────────────────────
SELECT name, code FROM offices ORDER BY name;
-- Expected 13 rows:
-- Ashuganj, Barishal, Bogura, Chittagong, Cumilla, Dhaka, Faridpur,
-- Khulna, Mymensingh, Noakhali, Rajshahi, Rangpur, Sylhet

-- ── 8 Power Plants with Real Capacities ──────────────────────────────────
SELECT name, installed_capacity_mw, plant_type, omf FROM plants ORDER BY name;
-- Expected:
-- Ashuganj 225MW       | 225.00    | thermal | 0.9500
-- Barapukuria 525MW    | 525.00    | thermal | 0.9200
-- Cumilla 225MW        | 225.00    | thermal | 0.9300
-- Ghorashal 630MW      | 630.00    | thermal | 0.9100
-- Haripur CCPP 412MW   | 412.00    | ccpp    | 0.9600
-- Meghnaghat 450MW     | 450.00    | thermal | 0.9400
-- Payra 1320MW         | 1320.00   | thermal | 0.9700
-- Siddhirgonj 210MW    | 210.00    | thermal | 0.9200

-- ── 7 Fuel Types ────────────────────────────────────────────────────────
SELECT name FROM fuel_types ORDER BY name;
-- Expected: Coal, Diesel, Furnace Oil, HFO, Hydro, Natural Gas, Solar

-- ── 4 Cross-Border Circuits (seed entries) ───────────────────────────────
SELECT DISTINCT circuit_name FROM cross_border_import ORDER BY circuit_name;
-- Expected:
-- Baharampur HVC 400KV
-- Comilla South Ckt-1
-- Comilla South Ckt-2
-- Tripura 132KV

-- ── 6 Utility Companies in Sales ─────────────────────────────────────────
SELECT DISTINCT utility_name FROM utility_sales ORDER BY utility_name;
-- Expected: BPDB, DPDC, DESCO, NESCO, PBS, WZPDCL

-- ── Sample April 2026 MOD Data ────────────────────────────────────────────
SELECT p.name, mr.month, mr.year, mr.net_generation
FROM mod_readings mr
JOIN plants p ON p.id = mr.plant_id
WHERE mr.month = 4 AND mr.year = 2026
ORDER BY p.name;

-- ── OMF History Integrity Check ──────────────────────────────────────────
-- Verify exactly one active (effective_to IS NULL) record per plant
SELECT plant_id, COUNT(*) as active_records
FROM omf_history
WHERE effective_to IS NULL
GROUP BY plant_id
HAVING COUNT(*) != 1;
-- Expected: 0 rows (no violations)
```

#### Validate Application Settings

```sql
-- System settings (configurable thresholds)
SELECT key, value, description FROM system_settings ORDER BY key;
-- Expected:
-- auxiliary_spike_threshold | 8.0  | Auxiliary spike alert threshold (%)
-- loss_threshold_percent    | 16.0 | System loss alert threshold (%)
-- submission_deadline_day   | 10   | Day of month for MOD submission deadline
```

#### Validate ARQ Worker Connectivity

```bash
# Check worker connected to Redis
docker-compose logs gridinel-worker | grep "Starting worker"
# Expected: "Starting worker for 5 functions"

# Queue a test task
curl -X POST http://localhost:8000/api/v1/reports/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"monthly_generation","parameters":{"month":4,"year":2026},"file_format":"PDF"}'
# Expected: {"id":"<uuid>","status":"Pending","message":"Report queued"}

# Poll status (should transition to Processing → Ready within 30s)
curl http://localhost:8000/api/v1/reports/<uuid>/status \
  -H "Authorization: Bearer $TOKEN"
```

#### Post-Deployment Health Matrix

| Check | Command | Expected Result |
|-------|---------|----------------|
| Backend API health | `curl localhost:8000/health` | `{"status":"ok"}` |
| OCR service health | `curl localhost:8001/health` | `{"status":"ok"}` |
| DB connection | `docker exec gridinel-db pg_isready` | `accepting connections` |
| Redis ping | `docker exec gridinel-redis redis-cli ping` | `PONG` |
| pgvector loaded | SQL: `SELECT * FROM pg_extension WHERE extname='vector'` | 1 row |
| Alembic current | `docker exec gridinel-backend alembic current` | HEAD revision |
| Seed data count | SQL: `SELECT COUNT(*) FROM plants` | `8` |
| Worker running | `docker-compose ps gridinel-worker` | `Up` |
| WebSocket test | `wscat -c "ws://localhost:8000/api/v1/notifications/ws?token=$TOKEN"` | Connected |
| Frontend loads | `curl -s -o /dev/null -w "%{http_code}" localhost:3000` | `200` |

---

### 4.4 Useful Operations

```bash
# Stop all services
docker-compose down

# Stop and wipe all data (full reset)
docker-compose down -v

# Rebuild only backend (after Python changes)
docker-compose up --build gridinel-backend gridinel-worker -d

# Rebuild only frontend (after Next.js changes)
docker-compose up --build gridinel-frontend -d

# Connect to PostgreSQL shell
docker exec -it gridinel-db psql -U gridinel -d gridinel_db

# Connect to Redis CLI
docker exec -it gridinel-redis redis-cli

# Run Alembic migration (after model changes)
docker exec gridinel-backend alembic revision --autogenerate -m "description"
docker exec gridinel-backend alembic upgrade head

# View ARQ worker queue depth
docker exec gridinel-redis redis-cli LLEN arq:queue:default

# Tail backend application logs
docker-compose logs -f --tail=100 gridinel-backend

# Export database backup
docker exec gridinel-db pg_dump -U gridinel gridinel_db > backup_$(date +%Y%m%d).sql

# Restore database backup
docker exec -i gridinel-db psql -U gridinel gridinel_db < backup_20260406.sql
```

---

*GridIntel Production Handbook v1.0*
*BPDB Power Intelligence Platform | Generated 2026*
*Covers: Parts 1–7 complete implementation*
