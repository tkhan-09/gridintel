-- ============================================================
-- GridIntel - Index Optimization
-- ============================================================

-- ============================================================
-- UNIQUE COMPOSITE INDEXES (prevent duplicate monthly data)
-- ============================================================

-- mod_readings: one reading per meter per month/year
CREATE UNIQUE INDEX IF NOT EXISTS uix_mod_readings_meter_month_year
    ON mod_readings (meter_id, month, year);

-- mod_submissions: one submission per plant per month/year
CREATE UNIQUE INDEX IF NOT EXISTS uix_mod_submissions_plant_month_year
    ON mod_submissions (plant_id, month, year);

-- cross_border_import: one record per circuit per month/year
CREATE UNIQUE INDEX IF NOT EXISTS uix_cross_border_circuit_month_year
    ON cross_border_import (circuit_name, month, year);

-- utility_sales: one record per utility per month/year
CREATE UNIQUE INDEX IF NOT EXISTS uix_utility_sales_utility_month_year
    ON utility_sales (utility_name, month, year);

-- billing_records: one bill per entity per month/year
CREATE UNIQUE INDEX IF NOT EXISTS uix_billing_entity_month_year
    ON billing_records (entity_type, entity_id, month, year);

-- forecasts: one forecast per target per horizon
CREATE UNIQUE INDEX IF NOT EXISTS uix_forecasts_target_horizon
    ON forecasts (target_type, target_id, horizon_month, horizon_year);

-- ============================================================
-- FOREIGN KEY PERFORMANCE INDEXES
-- ============================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_role_id     ON users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_office_id   ON users (office_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users (is_active);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users (email);

-- plants
CREATE INDEX IF NOT EXISTS idx_plants_office_id  ON plants (office_id);
CREATE INDEX IF NOT EXISTS idx_plants_status     ON plants (status);
CREATE INDEX IF NOT EXISTS idx_plants_fuel_type  ON plants (fuel_type);

-- omf_history
CREATE INDEX IF NOT EXISTS idx_omf_plant_id           ON omf_history (plant_id);
CREATE INDEX IF NOT EXISTS idx_omf_effective_from     ON omf_history (effective_from);
CREATE INDEX IF NOT EXISTS idx_omf_plant_date_range   ON omf_history (plant_id, effective_from, effective_to);

-- meters
CREATE INDEX IF NOT EXISTS idx_meters_plant_id     ON meters (plant_id);
CREATE INDEX IF NOT EXISTS idx_meters_meter_type   ON meters (meter_type);
CREATE INDEX IF NOT EXISTS idx_meters_direction    ON meters (direction);

-- meter_cf_history
CREATE INDEX IF NOT EXISTS idx_meter_cf_meter_id       ON meter_cf_history (meter_id);
CREATE INDEX IF NOT EXISTS idx_meter_cf_effective_from ON meter_cf_history (effective_from);

-- mod_readings
CREATE INDEX IF NOT EXISTS idx_mod_readings_meter_id   ON mod_readings (meter_id);
CREATE INDEX IF NOT EXISTS idx_mod_readings_month_year ON mod_readings (month, year);

-- mod_submissions
CREATE INDEX IF NOT EXISTS idx_mod_submissions_plant_id    ON mod_submissions (plant_id);
CREATE INDEX IF NOT EXISTS idx_mod_submissions_month_year  ON mod_submissions (month, year);
CREATE INDEX IF NOT EXISTS idx_mod_submissions_status      ON mod_submissions (status);
CREATE INDEX IF NOT EXISTS idx_mod_submissions_submitted_by ON mod_submissions (submitted_by);

-- cross_border_import
CREATE INDEX IF NOT EXISTS idx_cbi_month_year     ON cross_border_import (month, year);
CREATE INDEX IF NOT EXISTS idx_cbi_circuit_name   ON cross_border_import (circuit_name);

-- utility_sales
CREATE INDEX IF NOT EXISTS idx_utility_sales_month_year    ON utility_sales (month, year);
CREATE INDEX IF NOT EXISTS idx_utility_sales_utility_name  ON utility_sales (utility_name);

-- billing_records
CREATE INDEX IF NOT EXISTS idx_billing_entity        ON billing_records (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_billing_month_year    ON billing_records (month, year);

-- energy_balance
CREATE INDEX IF NOT EXISTS idx_energy_balance_month_year ON energy_balance (month, year);

-- adjustments
CREATE INDEX IF NOT EXISTS idx_adjustments_entity        ON adjustments (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_month_year    ON adjustments (month, year);
CREATE INDEX IF NOT EXISTS idx_adjustments_approved_by   ON adjustments (approved_by);

-- audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id     ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name  ON audit_log (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp   ON audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action      ON audit_log (action);

-- anomaly_alerts
CREATE INDEX IF NOT EXISTS idx_anomaly_severity      ON anomaly_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_anomaly_is_resolved   ON anomaly_alerts (is_resolved);
CREATE INDEX IF NOT EXISTS idx_anomaly_entity        ON anomaly_alerts (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_created_at    ON anomaly_alerts (created_at DESC);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id  ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read  ON notifications (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications (created_at DESC);

-- forecasts
CREATE INDEX IF NOT EXISTS idx_forecasts_target       ON forecasts (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_horizon      ON forecasts (horizon_month, horizon_year);

-- reports
CREATE INDEX IF NOT EXISTS idx_reports_generated_by   ON reports (generated_by);
CREATE INDEX IF NOT EXISTS idx_reports_type           ON reports (type);
CREATE INDEX IF NOT EXISTS idx_reports_created_at     ON reports (created_at DESC);

-- rag_documents
CREATE INDEX IF NOT EXISTS idx_rag_docs_doc_type      ON rag_documents (doc_type);
CREATE INDEX IF NOT EXISTS idx_rag_docs_uploaded_at   ON rag_documents (uploaded_at DESC);

-- rag_embeddings
CREATE INDEX IF NOT EXISTS idx_rag_embeddings_doc_id  ON rag_embeddings (doc_id);

-- ============================================================
-- VECTOR INDEX (HNSW for cosine similarity search)
-- Using HNSW over IVFFlat: no training required, better recall
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rag_embeddings_hnsw
    ON rag_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
