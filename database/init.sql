-- ============================================================
-- GridIntel - Database Schema
-- PostgreSQL 15 with pgvector
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. ROLES
-- ============================================================
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    permissions JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================
-- 2. OFFICES / CIRCLES
-- ============================================================
CREATE TABLE offices (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL UNIQUE,
    region      VARCHAR(100),
    code        VARCHAR(20) NOT NULL UNIQUE
);

-- ============================================================
-- 3. USERS
-- ============================================================
CREATE TABLE users (
    id                   SERIAL PRIMARY KEY,
    username             VARCHAR(80) NOT NULL UNIQUE,
    email                VARCHAR(200) NOT NULL UNIQUE,
    hashed_password      VARCHAR(256) NOT NULL,
    role_id              INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    office_id            INTEGER REFERENCES offices(id) ON DELETE SET NULL,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reset_token          VARCHAR(256),
    reset_token_expires  TIMESTAMPTZ
);

-- ============================================================
-- 4. PLANTS
-- ============================================================
CREATE TABLE plants (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(200) NOT NULL UNIQUE,
    capacity_mw   NUMERIC(10, 2) NOT NULL,
    fuel_type     VARCHAR(50) NOT NULL,
    technology    VARCHAR(100) NOT NULL,
    ownership     VARCHAR(100) NOT NULL,
    sector        VARCHAR(100),
    grid_voltage  VARCHAR(20),
    office_id     INTEGER REFERENCES offices(id) ON DELETE SET NULL,
    status        VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Under Maintenance','Decommissioned'))
);

-- ============================================================
-- 5. OMF HISTORY  (Operational Maintenance Factor)
-- ============================================================
CREATE TABLE omf_history (
    id              SERIAL PRIMARY KEY,
    plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    omf_value       NUMERIC(6, 4) NOT NULL CHECK (omf_value >= 0 AND omf_value <= 1),
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    changed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    change_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT omf_no_overlap EXCLUDE USING GIST (
        plant_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
    )
);

-- ============================================================
-- 6. METERS
-- ============================================================
CREATE TABLE meters (
    id           SERIAL PRIMARY KEY,
    plant_id     INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    meter_number VARCHAR(50) NOT NULL UNIQUE,
    meter_type   VARCHAR(20) NOT NULL CHECK (meter_type IN ('Main','Check','Standby')),
    multiplier   NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
    direction    VARCHAR(20) NOT NULL CHECK (direction IN ('Export','Import','Station'))
);

-- ============================================================
-- 7. METER CORRECTION FACTOR HISTORY
-- ============================================================
CREATE TABLE meter_cf_history (
    id                SERIAL PRIMARY KEY,
    meter_id          INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    correction_factor NUMERIC(10, 6) NOT NULL DEFAULT 1.0,
    effective_from    DATE NOT NULL,
    effective_to      DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. MOD READINGS  (Monthly Operational Data)
-- ============================================================
CREATE TABLE mod_readings (
    id                    SERIAL PRIMARY KEY,
    meter_id              INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    month                 SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year                  SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    opening_reading       NUMERIC(14, 2) NOT NULL,
    closing_reading       NUMERIC(14, 2) NOT NULL,
    advanced_reading      NUMERIC(14, 2),
    active_energy_kwh     NUMERIC(16, 2) GENERATED ALWAYS AS (
                              (closing_reading - opening_reading)
                          ) STORED,
    reactive_energy_kvarh NUMERIC(16, 2),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. MOD SUBMISSIONS
-- ============================================================
CREATE TABLE mod_submissions (
    id           SERIAL PRIMARY KEY,
    plant_id     INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    month        SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year         SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    status       VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Verified','Locked')),
    submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    verified_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. MONTH LOCKS
-- ============================================================
CREATE TABLE month_locks (
    id         SERIAL PRIMARY KEY,
    month      SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year       SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    is_locked  BOOLEAN NOT NULL DEFAULT FALSE,
    locked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    locked_at  TIMESTAMPTZ,
    UNIQUE (month, year)
);

-- ============================================================
-- 11. CROSS BORDER IMPORT
-- ============================================================
CREATE TABLE cross_border_import (
    id                     SERIAL PRIMARY KEY,
    circuit_name           VARCHAR(150) NOT NULL,
    month                  SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year                   SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    opening_reading        NUMERIC(14, 2) NOT NULL,
    closing_reading        NUMERIC(14, 2) NOT NULL,
    active_energy_kwh      NUMERIC(16, 2) GENERATED ALWAYS AS (
                               closing_reading - opening_reading
                           ) STORED,
    billing_net_energy_kwh NUMERIC(16, 2),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. UTILITY SALES
-- ============================================================
CREATE TABLE utility_sales (
    id                INTEGER PRIMARY KEY,
    utility_name      VARCHAR(100) NOT NULL,
    month             SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year              SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    bulk_supply_point VARCHAR(200),
    active_energy_kwh NUMERIC(16, 2) NOT NULL,
    peak_demand_mw    NUMERIC(10, 3),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. BILLING RECORDS
-- ============================================================
CREATE TABLE billing_records (
    id                INTEGER PRIMARY KEY,
    entity_type       VARCHAR(20) NOT NULL CHECK (entity_type IN ('Plant','Utility','CrossBorder')),
    entity_id         INTEGER NOT NULL,
    month             SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year              SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    rate_per_kwh      NUMERIC(10, 6) NOT NULL,
    gross_bill        NUMERIC(18, 2) NOT NULL,
    total_deductions  NUMERIC(18, 2) NOT NULL DEFAULT 0,
    net_bill          NUMERIC(18, 2) GENERATED ALWAYS AS (gross_bill - total_deductions) STORED,
    outstanding_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    invoice_pdf_url   VARCHAR(500),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add sequence for billing_records and utility_sales (not SERIAL, need explicit)
CREATE SEQUENCE billing_records_id_seq START 1;
ALTER TABLE billing_records ALTER COLUMN id SET DEFAULT nextval('billing_records_id_seq');

CREATE SEQUENCE utility_sales_id_seq START 1;
ALTER TABLE utility_sales ALTER COLUMN id SET DEFAULT nextval('utility_sales_id_seq');

-- ============================================================
-- 14. ENERGY BALANCE
-- ============================================================
CREATE TABLE energy_balance (
    id                       SERIAL PRIMARY KEY,
    month                    SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year                     SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    total_generation_kwh     NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_import_kwh         NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_available_energy_kwh NUMERIC(18, 2) GENERATED ALWAYS AS (
                                 total_generation_kwh + total_import_kwh
                             ) STORED,
    total_utility_sales_kwh  NUMERIC(18, 2) NOT NULL DEFAULT 0,
    system_loss_kwh          NUMERIC(18, 2) GENERATED ALWAYS AS (
                                 (total_generation_kwh + total_import_kwh) - total_utility_sales_kwh
                             ) STORED,
    system_loss_percent      NUMERIC(7, 4) GENERATED ALWAYS AS (
                                 CASE
                                     WHEN (total_generation_kwh + total_import_kwh) = 0 THEN 0
                                     ELSE ROUND(
                                         (((total_generation_kwh + total_import_kwh) - total_utility_sales_kwh)
                                         / (total_generation_kwh + total_import_kwh)) * 100, 4
                                     )
                                 END
                             ) STORED,
    calculated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (month, year)
);

-- ============================================================
-- 15. ADJUSTMENTS
-- ============================================================
CREATE TABLE adjustments (
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       INTEGER NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year            SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    field_name      VARCHAR(100) NOT NULL,
    original_value  NUMERIC(18, 6),
    adjusted_value  NUMERIC(18, 6),
    approved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approval_reason TEXT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 16. AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(50) NOT NULL,
    table_name  VARCHAR(100) NOT NULL,
    record_id   INTEGER,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 17. ANOMALY ALERTS
-- ============================================================
CREATE TABLE anomaly_alerts (
    id           SERIAL PRIMARY KEY,
    type         VARCHAR(100) NOT NULL,
    severity     VARCHAR(20) NOT NULL CHECK (severity IN ('Info','Warning','Critical')),
    description  TEXT NOT NULL,
    entity_type  VARCHAR(50),
    entity_id    INTEGER,
    is_resolved  BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 18. NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(200) NOT NULL,
    message    TEXT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    type       VARCHAR(50) NOT NULL DEFAULT 'info',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 19. FORECASTS
-- ============================================================
CREATE TABLE forecasts (
    id                        SERIAL PRIMARY KEY,
    target_type               VARCHAR(50) NOT NULL,
    target_id                 INTEGER NOT NULL,
    horizon_month             SMALLINT NOT NULL CHECK (horizon_month BETWEEN 1 AND 12),
    horizon_year              SMALLINT NOT NULL CHECK (horizon_year BETWEEN 2000 AND 2100),
    predicted_value           NUMERIC(18, 4) NOT NULL,
    confidence_interval_lower NUMERIC(18, 4),
    confidence_interval_upper NUMERIC(18, 4),
    model_used                VARCHAR(100),
    generated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 20. REPORTS
-- ============================================================
CREATE TABLE reports (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(300) NOT NULL,
    type            VARCHAR(100) NOT NULL,
    generated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    file_path       VARCHAR(500),
    context_filters JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 21. RAG DOCUMENTS
-- ============================================================
CREATE TABLE rag_documents (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(300) NOT NULL,
    content     TEXT,
    doc_type    VARCHAR(100),
    file_path   VARCHAR(500),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 22. RAG EMBEDDINGS  (pgvector)
-- ============================================================
CREATE TABLE rag_embeddings (
    id          SERIAL PRIMARY KEY,
    doc_id      INTEGER NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text  TEXT NOT NULL,
    embedding   vector(1536) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (doc_id, chunk_index)
);

-- ============================================================
-- TRIGGERS: updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_mod_readings_updated_at
    BEFORE UPDATE ON mod_readings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
