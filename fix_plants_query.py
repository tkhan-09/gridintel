with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()

old = """    top_plants_sql = text(f\"\"\"
        SELECT
            p.id                                            AS plant_id,
            p.name                                         AS plant_name,
            p.fuel_type,
            p.installed_capacity                           AS capacity_mw,
            COALESCE(SUM(mr.net_gen_kwh) / 1000000.0, 0)  AS net_gen_mu,
            CASE
                WHEN p.installed_capacity > 0 AND COUNT(mr.id) > 0
                THEN ROUND(
                        COALESCE(SUM(mr.net_gen_kwh), 0)
                        / (p.installed_capacity * 1000 * 24 * 30),
                     4)
                ELSE 0
            END                                            AS plant_factor
        FROM plants p
        LEFT JOIN mod_readings mr
            ON mr.plant_id = p.id
           AND mr.month    = :month
           AND mr.year     = :year
        WHERE p.is_active = TRUE
          {plant_office_filter}
        GROUP BY p.id, p.name, p.fuel_type, p.installed_capacity
        ORDER BY net_gen_mu DESC
        LIMIT 5
    \"\"\")"""

new = """    top_plants_sql = text(f\"\"\"
        SELECT
            p.id                                            AS plant_id,
            p.name                                         AS plant_name,
            p.fuel_type,
            p.installed_capacity_mw                        AS capacity_mw,
            COALESCE(SUM(mr.active_energy_kwh) / 1000000.0, 0) AS net_gen_mu,
            0 AS plant_factor
        FROM plants p
        LEFT JOIN meters m ON m.plant_id = p.id
        LEFT JOIN mod_readings mr
            ON mr.meter_id = m.id
           AND mr.month    = :month
           AND mr.year     = :year
        WHERE p.is_active = TRUE
        GROUP BY p.id, p.name, p.fuel_type, p.installed_capacity_mw
        ORDER BY net_gen_mu DESC
        LIMIT 5
    \"\"\")"""

if old in c:
    c = c.replace(old, new)
    print('Replaced')
else:
    print('Pattern not found, trying partial fix')
    c = c.replace('mr.net_gen_kwh', 'mr.active_energy_kwh')
    c = c.replace('mr.plant_id = p.id', 'mr.meter_id = m.id')
    c = c.replace('p.installed_capacity', 'p.installed_capacity_mw')

with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
