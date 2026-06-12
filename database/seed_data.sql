-- ============================================================
-- GridIntel - Seed Data
-- Production-grade initial data for BPDB GridIntel
-- ============================================================

-- ============================================================
-- 1. ROLES
-- ============================================================
INSERT INTO roles (id, name, permissions) VALUES
(1, 'SuperAdmin', '{"all": true}'),
(2, 'Admin', '{
    "dashboard": ["read"],
    "plants": ["read","write","update"],
    "meters": ["read","write","update"],
    "mod_readings": ["read","write","update","delete"],
    "mod_submissions": ["read","write","update","verify","lock"],
    "billing": ["read","write","update"],
    "energy_balance": ["read","write"],
    "adjustments": ["read","write","approve"],
    "reports": ["read","generate"],
    "users": ["read","write","update"],
    "anomaly_alerts": ["read","update"],
    "audit_log": ["read"]
}'),
(3, 'Operator', '{
    "dashboard": ["read"],
    "plants": ["read"],
    "meters": ["read"],
    "mod_readings": ["read","write","update"],
    "mod_submissions": ["read","submit"],
    "billing": ["read"],
    "energy_balance": ["read"],
    "reports": ["read","generate"],
    "anomaly_alerts": ["read"]
}'),
(4, 'Auditor', '{
    "dashboard": ["read"],
    "plants": ["read"],
    "meters": ["read"],
    "mod_readings": ["read"],
    "mod_submissions": ["read","verify"],
    "billing": ["read"],
    "energy_balance": ["read"],
    "adjustments": ["read","write","approve"],
    "reports": ["read","generate"],
    "audit_log": ["read"],
    "anomaly_alerts": ["read","update"]
}'),
(5, 'Viewer', '{
    "dashboard": ["read"],
    "plants": ["read"],
    "meters": ["read"],
    "mod_readings": ["read"],
    "mod_submissions": ["read"],
    "billing": ["read"],
    "energy_balance": ["read"],
    "reports": ["read"],
    "anomaly_alerts": ["read"]
}')
ON CONFLICT (id) DO NOTHING;

SELECT setval('roles_id_seq', (SELECT MAX(id) FROM roles));

-- ============================================================
-- 2. OFFICES / CIRCLES (13 BPDB Circles)
-- ============================================================
INSERT INTO offices (id, name, region, code) VALUES
(1,  'BPDB Head Office',                 'Dhaka',        'HO-DHA'),
(2,  'Dhaka Circle',                     'Dhaka',        'CIR-DHA'),
(3,  'Chattogram Circle',                'Chattogram',   'CIR-CTG'),
(4,  'Khulna Circle',                    'Khulna',       'CIR-KHL'),
(5,  'Rajshahi Circle',                  'Rajshahi',     'CIR-RAJ'),
(6,  'Sylhet Circle',                    'Sylhet',       'CIR-SYL'),
(7,  'Barishal Circle',                  'Barishal',     'CIR-BAR'),
(8,  'Mymensingh Circle',                'Mymensingh',   'CIR-MYM'),
(9,  'Cumilla Circle',                   'Cumilla',      'CIR-CUM'),
(10, 'Rangpur Circle',                   'Rangpur',      'CIR-RAN'),
(11, 'Faridpur Circle',                  'Faridpur',     'CIR-FAR'),
(12, 'Brahmanbaria Circle',              'Brahmanbaria', 'CIR-BRA'),
(13, 'Ashuganj Power Generation Circle', 'Brahmanbaria', 'CIR-APG')
ON CONFLICT (id) DO NOTHING;

SELECT setval('offices_id_seq', (SELECT MAX(id) FROM offices));

-- ============================================================
-- 3. PLANTS (8 Major BPDB Power Plants)
-- ============================================================
INSERT INTO plants (id, name, capacity_mw, fuel_type, technology, ownership, sector, grid_voltage, office_id, status) VALUES
(1, 'Ashuganj 450MW Combined Cycle Power Plant',
    450.00, 'Gas', 'Combined Cycle', 'BPDB Own', 'Public', '400kV', 13, 'Active'),
(2, 'Haripur 412MW Combined Cycle Power Plant',
    412.00, 'Gas', 'Combined Cycle', 'BPDB Own', 'Public', '230kV', 2,  'Active'),
(3, 'Ghorashal Unit-7 Steam Turbine Power Plant',
    210.00, 'Gas', 'Steam Turbine',  'BPDB Own', 'Public', '230kV', 2,  'Active'),
(4, 'Payra 1320MW Coal Thermal Power Plant',
    1320.00,'Coal','Steam Turbine',  'Joint Venture (NPCBL)', 'Public-Private', '400kV', 4, 'Active'),
(5, 'Kaptai Hydroelectric Power Station',
    230.00, 'Water','Hydro Turbine', 'BPDB Own', 'Public', '132kV', 3,  'Active'),
(6, 'Summit Meghnaghat II Power Plant',
    583.00, 'Gas', 'Combined Cycle', 'IPP (Summit Power)', 'Private', '400kV', 2, 'Active'),
(7, 'Rampal Maitree Super Thermal Power Plant',
    1320.00,'Coal','Steam Turbine',  'Joint Venture (BIFPCL)', 'Public-Private', '400kV', 4, 'Active'),
(8, 'Sirajganj 225MW Combined Cycle Power Plant',
    225.00, 'Dual Fuel', 'Combined Cycle', 'NWPGCL', 'Public', '230kV', 5, 'Active')
ON CONFLICT (id) DO NOTHING;

SELECT setval('plants_id_seq', (SELECT MAX(id) FROM plants));

-- ============================================================
-- 4. METERS (Main, Check, Station per plant)
-- ============================================================
INSERT INTO meters (id, plant_id, meter_number, meter_type, multiplier, direction) VALUES
-- Ashuganj 450MW (plant 1)
(1,  1, 'ASH-450-M01', 'Main',    2400.0,  'Export'),
(2,  1, 'ASH-450-C01', 'Check',   2400.0,  'Export'),
(3,  1, 'ASH-450-S01', 'Standby', 2400.0,  'Export'),
(4,  1, 'ASH-450-ST1', 'Main',    100.0,   'Station'),
-- Haripur 412MW (plant 2)
(5,  2, 'HAR-412-M01', 'Main',    1600.0,  'Export'),
(6,  2, 'HAR-412-C01', 'Check',   1600.0,  'Export'),
(7,  2, 'HAR-412-ST1', 'Main',    100.0,   'Station'),
-- Ghorashal Unit-7 (plant 3)
(8,  3, 'GHO-U7-M01',  'Main',    800.0,   'Export'),
(9,  3, 'GHO-U7-C01',  'Check',   800.0,   'Export'),
(10, 3, 'GHO-U7-ST1',  'Main',    50.0,    'Station'),
-- Payra 1320MW (plant 4)
(11, 4, 'PAY-1320-M01','Main',    4000.0,  'Export'),
(12, 4, 'PAY-1320-C01','Check',   4000.0,  'Export'),
(13, 4, 'PAY-1320-ST1','Main',    200.0,   'Station'),
-- Kaptai Hydro (plant 5)
(14, 5, 'KAP-HY-M01',  'Main',    400.0,   'Export'),
(15, 5, 'KAP-HY-C01',  'Check',   400.0,   'Export'),
(16, 5, 'KAP-HY-ST1',  'Main',    50.0,    'Station'),
-- Summit Meghnaghat II (plant 6)
(17, 6, 'SMG-583-M01', 'Main',    2000.0,  'Export'),
(18, 6, 'SMG-583-C01', 'Check',   2000.0,  'Export'),
(19, 6, 'SMG-583-ST1', 'Main',    100.0,   'Station'),
-- Rampal (plant 7)
(20, 7, 'RAM-1320-M01','Main',    4000.0,  'Export'),
(21, 7, 'RAM-1320-C01','Check',   4000.0,  'Export'),
(22, 7, 'RAM-1320-ST1','Main',    200.0,   'Station'),
-- Sirajganj 225MW (plant 8)
(23, 8, 'SIR-225-M01', 'Main',    800.0,   'Export'),
(24, 8, 'SIR-225-C01', 'Check',   800.0,   'Export'),
(25, 8, 'SIR-225-ST1', 'Main',    50.0,    'Station')
ON CONFLICT (id) DO NOTHING;

SELECT setval('meters_id_seq', (SELECT MAX(id) FROM meters));

-- ============================================================
-- 5. METER CORRECTION FACTOR HISTORY
-- ============================================================
INSERT INTO meter_cf_history (id, meter_id, correction_factor, effective_from, effective_to) VALUES
(1,  1,  1.000120, '2024-01-01', NULL),
(2,  2,  1.000080, '2024-01-01', NULL),
(3,  3,  1.000100, '2024-01-01', NULL),
(4,  4,  1.000000, '2024-01-01', NULL),
(5,  5,  1.000150, '2024-01-01', NULL),
(6,  6,  1.000090, '2024-01-01', NULL),
(7,  7,  1.000000, '2024-01-01', NULL),
(8,  8,  1.000110, '2024-01-01', NULL),
(9,  9,  1.000070, '2024-01-01', NULL),
(10, 10, 1.000000, '2024-01-01', NULL),
(11, 11, 1.000200, '2024-01-01', NULL),
(12, 12, 1.000180, '2024-01-01', NULL),
(13, 13, 1.000000, '2024-01-01', NULL),
(14, 14, 1.000130, '2024-01-01', NULL),
(15, 15, 1.000095, '2024-01-01', NULL),
(16, 16, 1.000000, '2024-01-01', NULL),
(17, 17, 1.000160, '2024-01-01', NULL),
(18, 18, 1.000140, '2024-01-01', NULL),
(19, 19, 1.000000, '2024-01-01', NULL),
(20, 20, 1.000210, '2024-01-01', NULL),
(21, 21, 1.000190, '2024-01-01', NULL),
(22, 22, 1.000000, '2024-01-01', NULL),
(23, 23, 1.000120, '2024-01-01', NULL),
(24, 24, 1.000085, '2024-01-01', NULL),
(25, 25, 1.000000, '2024-01-01', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT setval('meter_cf_history_id_seq', (SELECT MAX(id) FROM meter_cf_history));

-- ============================================================
-- 6. OMF HISTORY (Operational Maintenance Factor)
-- ============================================================
INSERT INTO omf_history (id, plant_id, omf_value, effective_from, effective_to, change_reason) VALUES
(1, 1, 0.9200, '2024-01-01', '2024-12-31', 'Annual revision FY2024'),
(2, 1, 0.9350, '2025-01-01', NULL,          'Annual revision FY2025'),
(3, 2, 0.9100, '2024-01-01', '2024-12-31', 'Annual revision FY2024'),
(4, 2, 0.9250, '2025-01-01', NULL,          'Annual revision FY2025'),
(5, 3, 0.8800, '2024-01-01', '2024-12-31', 'Aging plant adjustment FY2024'),
(6, 3, 0.8950, '2025-01-01', NULL,          'Post-overhaul revision FY2025'),
(7, 4, 0.9500, '2024-01-01', '2024-12-31', 'New plant standard FY2024'),
(8, 4, 0.9600, '2025-01-01', NULL,          'Stabilization revision FY2025'),
(9, 5, 0.8500, '2024-01-01', '2024-12-31', 'Hydro seasonal adjustment FY2024'),
(10,5, 0.8650, '2025-01-01', NULL,          'Revised capacity factor FY2025'),
(11,6, 0.9400, '2024-01-01', '2024-12-31', 'IPP contract standard FY2024'),
(12,6, 0.9450, '2025-01-01', NULL,          'IPP contract revision FY2025'),
(13,7, 0.9550, '2024-01-01', '2024-12-31', 'New plant standard FY2024'),
(14,7, 0.9600, '2025-01-01', NULL,          'Operational revision FY2025'),
(15,8, 0.9000, '2024-01-01', '2024-12-31', 'NWPGCL standard FY2024'),
(16,8, 0.9150, '2025-01-01', NULL,          'NWPGCL revision FY2025')
ON CONFLICT (id) DO NOTHING;

SELECT setval('omf_history_id_seq', (SELECT MAX(id) FROM omf_history));

-- ============================================================
-- 7. SUPERADMIN USER
-- Password: Admin@GridIntel2024! (bcrypt hashed, cost 12)
-- ============================================================
INSERT INTO users (id, username, email, hashed_password, role_id, office_id, is_active) VALUES
(1,
 'superadmin',
 'superadmin@bpdb.gov.bd',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewrPAn6B8R4sEZmS',
 1,
 1,
 TRUE)
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- ============================================================
-- 8. MOD SUBMISSIONS (April 2026 - Draft/Submitted states)
-- ============================================================
INSERT INTO mod_submissions (id, plant_id, month, year, status, submitted_by, submitted_at) VALUES
(1, 1, 4, 2026, 'Submitted',  1, '2026-05-03 09:15:00+06'),
(2, 2, 4, 2026, 'Submitted',  1, '2026-05-03 10:30:00+06'),
(3, 3, 4, 2026, 'Verified',   1, '2026-05-04 11:00:00+06'),
(4, 4, 4, 2026, 'Submitted',  1, '2026-05-03 14:00:00+06'),
(5, 5, 4, 2026, 'Draft',      1, NULL),
(6, 6, 4, 2026, 'Submitted',  1, '2026-05-04 09:45:00+06'),
(7, 7, 4, 2026, 'Submitted',  1, '2026-05-04 13:20:00+06'),
(8, 8, 4, 2026, 'Draft',      1, NULL)
ON CONFLICT (id) DO NOTHING;

SELECT setval('mod_submissions_id_seq', (SELECT MAX(id) FROM mod_submissions));

-- ============================================================
-- 9. MOD READINGS (April 2026 - realistic meter readings)
-- ============================================================
-- Readings are for month=4, year=2026
-- active_energy_kwh is generated = closing_reading - opening_reading
-- Multiplier applied in application layer

INSERT INTO mod_readings (id, meter_id, month, year, opening_reading, closing_reading, advanced_reading, reactive_energy_kvarh) VALUES
-- Ashuganj 450MW Main Export Meter (meter 1, multiplier 2400)
-- ~290 GWh generation: 290,000,000 / 2400 = 120,833 units difference
(1,  1,  4, 2026, 458321.40, 579154.80, NULL,    42100.50),
-- Ashuganj Check Export Meter (meter 2)
(2,  2,  4, 2026, 458298.20, 579129.60, NULL,    42095.20),
-- Ashuganj Standby (meter 3) - inactive, minimal reading
(3,  3,  4, 2026, 125000.00, 125000.00, NULL,    0.00),
-- Ashuganj Station Meter (meter 4, multiplier 100)
-- ~8% auxiliary: 290 GWh * 0.08 / 100 = 23,200 units
(4,  4,  4, 2026, 98432.10,  121632.10, NULL,    9840.30),

-- Haripur 412MW Main Export (meter 5, multiplier 1600)
-- ~265 GWh: 265,000,000 / 1600 = 165,625 units diff
(5,  5,  4, 2026, 612450.80, 778075.80, NULL,    38750.40),
-- Haripur Check (meter 6)
(6,  6,  4, 2026, 612421.30, 778044.30, NULL,    38742.10),
-- Haripur Station (meter 7, multiplier 100)
(7,  7,  4, 2026, 74320.50,  95520.50,  NULL,    7950.20),

-- Ghorashal Unit-7 Main Export (meter 8, multiplier 800)
-- ~130 GWh: 130,000,000 / 800 = 162,500 units diff
(8,  8,  4, 2026, 987654.30, 1150154.30, NULL,   18900.60),
-- Ghorashal Check (meter 9)
(9,  9,  4, 2026, 987632.10, 1150130.10, NULL,   18896.40),
-- Ghorashal Station (meter 10, multiplier 50)
(10, 10, 4, 2026, 456123.40, 475523.40, NULL,    5820.10),

-- Payra 1320MW Main Export (meter 11, multiplier 4000)
-- ~850 GWh: 850,000,000 / 4000 = 212,500 units diff
(11, 11, 4, 2026, 1254780.20, 1467280.20, NULL,  98450.70),
-- Payra Check (meter 12)
(12, 12, 4, 2026, 1254745.80, 1467243.80, NULL,  98440.30),
-- Payra Station (meter 13, multiplier 200)
(13, 13, 4, 2026, 312450.60,  380250.60, NULL,   19850.40),

-- Kaptai Hydro Main Export (meter 14, multiplier 400)
-- ~80 GWh: 80,000,000 / 400 = 200,000 units diff
(14, 14, 4, 2026, 3456789.10, 3656789.10, NULL,  12400.80),
-- Kaptai Check (meter 15)
(15, 15, 4, 2026, 3456761.40, 3656759.40, NULL,  12395.50),
-- Kaptai Station (meter 16, multiplier 50)
(16, 16, 4, 2026, 98765.30,   104565.30, NULL,   2480.90),

-- Summit Meghnaghat II Main Export (meter 17, multiplier 2000)
-- ~375 GWh: 375,000,000 / 2000 = 187,500 units diff
(17, 17, 4, 2026, 845670.40,  1033170.40, NULL,  54750.20),
-- Summit Check (meter 18)
(18, 18, 4, 2026, 845643.20,  1033141.20, NULL,  54742.80),
-- Summit Station (meter 19, multiplier 100)
(19, 19, 4, 2026, 125430.70,  155430.70, NULL,   12300.60),

-- Rampal Main Export (meter 20, multiplier 4000)
-- ~820 GWh: 820,000,000 / 4000 = 205,000 units diff
(20, 20, 4, 2026, 987543.20,  1192543.20, NULL,  95200.40),
-- Rampal Check (meter 21)
(21, 21, 4, 2026, 987512.80,  1192510.80, NULL,  95190.60),
-- Rampal Station (meter 22, multiplier 200)
(22, 22, 4, 2026, 245670.30,  310270.30, NULL,   18950.70),

-- Sirajganj 225MW Main Export (meter 23, multiplier 800)
-- ~145 GWh: 145,000,000 / 800 = 181,250 units diff
(23, 23, 4, 2026, 654320.10,  835570.10, NULL,   21150.30),
-- Sirajganj Check (meter 24)
(24, 24, 4, 2026, 654298.70,  835546.70, NULL,   21144.90),
-- Sirajganj Station (meter 25, multiplier 50)
(25, 25, 4, 2026, 123456.80,  134956.80, NULL,   4560.20)
ON CONFLICT (id) DO NOTHING;

SELECT setval('mod_readings_id_seq', (SELECT MAX(id) FROM mod_readings));

-- ============================================================
-- 10. CROSS BORDER IMPORT (April 2026)
-- 4 circuits: Bheramara-Baharampur, Comilla-Tripura,
--             Baharampur-Bheramara 2, Muzaffarpur-Dhalkebar
-- ============================================================
INSERT INTO cross_border_import (id, circuit_name, month, year, opening_reading, closing_reading, billing_net_energy_kwh) VALUES
(1, 'Bheramara-Baharampur 400kV Circuit-1',   4, 2026, 7845612.30, 7969412.30, 123680000.00),
(2, 'Comilla-Tripura 132kV Circuit',           4, 2026, 2345678.90, 2365078.90,  19260000.00),
(3, 'Bheramara-Baharampur 400kV Circuit-2',   4, 2026, 6712345.60, 6832945.60, 120400000.00),
(4, 'Muzaffarpur-Dhalkebar 400kV Circuit',     4, 2026, 3456789.20, 3518789.20,  61800000.00)
ON CONFLICT (id) DO NOTHING;

SELECT setval('cross_border_import_id_seq', (SELECT MAX(id) FROM cross_border_import));

-- ============================================================
-- 11. UTILITY SALES (April 2026)
-- DESCO, DPDC, WZPDCO, NESCO, BREB, BPDB Distribution
-- ============================================================
INSERT INTO utility_sales (id, utility_name, month, year, bulk_supply_point, active_energy_kwh, peak_demand_mw) VALUES
(1, 'DESCO',              4, 2026, 'Gulshan, Mirpur, Abdullahpur BSP', 850000000.00,  1620.500),
(2, 'DPDC',               4, 2026, 'Rayer Bazar, Demra, Jatrabari BSP',920000000.00, 1780.250),
(3, 'WZPDCO',             4, 2026, 'Khulna, Bagerhat, Jessore BSP',    480000000.00,  920.750),
(4, 'NESCO',              4, 2026, 'Rajshahi, Chapai, Rangpur BSP',    380000000.00,  740.300),
(5, 'BREB',               4, 2026, 'Rural Electrification BSP',       1450000000.00, 2850.000),
(6, 'BPDB Distribution',  4, 2026, 'Various Urban Distribution BSP',   320000000.00,  620.400)
ON CONFLICT (id) DO NOTHING;

SELECT setval('utility_sales_id_seq', (SELECT MAX(id) FROM utility_sales));

-- ============================================================
-- 12. ENERGY BALANCE (April 2026)
-- Total generation (sum of all plants, approx):
--   Ashuganj:   290,000,000 kWh
--   Haripur:    265,000,000 kWh
--   Ghorashal:  130,000,000 kWh
--   Payra:      850,000,000 kWh
--   Kaptai:      80,000,000 kWh
--   Summit:     375,000,000 kWh
--   Rampal:     820,000,000 kWh
--   Sirajganj:  145,000,000 kWh
--   TOTAL:    2,955,000,000 kWh
-- Cross-border imports:
--   ~325,140,000 kWh
-- Total available: 3,280,140,000 kWh
-- Total utility sales: 4,400,000,000 kWh (rest from other sources not seeded)
-- System loss seeded based on seeded data only
-- ============================================================
INSERT INTO energy_balance (id, month, year, total_generation_kwh, total_import_kwh, total_utility_sales_kwh) VALUES
(1, 4, 2026, 2955000000.00, 325140000.00, 3280140000.00 * 0.855)
ON CONFLICT (month, year) DO NOTHING;

-- Recalculate with accurate values
UPDATE energy_balance SET
    total_generation_kwh    = 2955000000.00,
    total_import_kwh        = 325140000.00,
    total_utility_sales_kwh = 2804519700.00
WHERE month = 4 AND year = 2026;

-- ============================================================
-- 13. MONTH LOCK (April 2026 - not locked yet)
-- ============================================================
INSERT INTO month_locks (id, month, year, is_locked) VALUES
(1, 4, 2026, FALSE)
ON CONFLICT (month, year) DO NOTHING;

SELECT setval('month_locks_id_seq', (SELECT MAX(id) FROM month_locks));

-- ============================================================
-- 14. ANOMALY ALERTS (Sample April 2026)
-- ============================================================
INSERT INTO anomaly_alerts (id, type, severity, description, entity_type, entity_id, is_resolved) VALUES
(1, 'HIGH_SYSTEM_LOSS',    'Warning',  'System loss for April 2026 at 14.5% approaching threshold of 16%', 'EnergyBalance', 1, FALSE),
(2, 'GENERATION_VARIANCE', 'Info',     'Kaptai Hydro generation 12% below seasonal forecast for April 2026', 'Plant', 5, FALSE),
(3, 'METER_CF_DEVIATION',  'Warning',  'Ashuganj Main Meter CF deviation >0.05% detected during cross-check', 'Meter', 1, TRUE),
(4, 'SUBMISSION_OVERDUE',  'Warning',  'Kaptai and Sirajganj MOD submission still in Draft state past due date', 'ModSubmission', 5, FALSE)
ON CONFLICT (id) DO NOTHING;

SELECT setval('anomaly_alerts_id_seq', (SELECT MAX(id) FROM anomaly_alerts));

-- ============================================================
-- 15. NOTIFICATIONS (for superadmin)
-- ============================================================
INSERT INTO notifications (id, user_id, title, message, is_read, type) VALUES
(1, 1, 'April 2026 MOD Submissions Open',
   'Monthly operational data submission window for April 2026 is now open. Please submit readings by May 5, 2026.',
   FALSE, 'info'),
(2, 1, 'System Loss Warning',
   'System loss for April 2026 is tracking at 14.5%. Review data to ensure accuracy before final lock.',
   FALSE, 'warning'),
(3, 1, 'Payra Plant Submission Received',
   'MOD submission for Payra 1320MW has been received and is pending verification.',
   TRUE, 'info'),
(4, 1, 'New User Registration Required',
   '3 operator accounts pending creation for Chattogram and Khulna circles.',
   FALSE, 'action')
ON CONFLICT (id) DO NOTHING;

SELECT setval('notifications_id_seq', (SELECT MAX(id) FROM notifications));

-- ============================================================
-- Done.
-- ============================================================
