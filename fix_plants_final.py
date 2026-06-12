with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()

old = """    top_plants_sql = text(f\"\"\"
        SELECT
            p.id                                            AS plant_id,
            p.name                                         AS plant_name,
            p.fuel_type,
            p.capacity_mw                           AS capacity_mw,
            COALESCE(SUM(mr.active_energy_kwh) / 1000000.0, 0)  AS net_gen_mu,
            CASE
                WHEN p.capacity_mw > 0 AND COUNT(mr.id) > 0
                THEN ROUND(CAST(
                        COALESCE(SUM(mr.active_energy_kwh) AS NUMERIC), 0)
                        / (p.capacity_mw * 1000 * 24 * 30),
                     4)
                ELSE 0
            END                                            AS plant_factor
        FROM plants p
        LEFT JOIN mod_readings mr
            ON mr.meter_id = m.id
           AND mr.month    = :month
           AND mr.year     = :year
        WHERE p.status = 'Active'
          {plant_office_filter}
        GROUP BY p.id, p.name, p.fuel_type, p.capacity_mw
        ORDER BY net_gen_mu DESC
        LIMIT 5
    \"\"\")"""

new = """    top_plants_sql = text(f\"\"\"
        SELECT
            p.id        AS plant_id,
            p.name      AS plant_name,
            p.fuel_type,
            p.capacity_mw,
            COALESCE(SUM(mr.active_energy_kwh) / 1000000.0, 0) AS net_gen_mu,
            0 AS plant_factor
        FROM plants p
        LEFT JOIN meters m ON m.plant_id = p.id
        LEFT JOIN mod_readings mr ON mr.meter_id = m.id
           AND mr.month = :month AND mr.year = :year
        WHERE p.status = 'Active'
        GROUP BY p.id, p.name, p.fuel_type, p.capacity_mw
        ORDER BY net_gen_mu DESC
        LIMIT 5
    \"\"\")"""

if old in c:
    c = c.replace(old, new)
    print('Replaced')
else:
    print('Not found, manual fix')
    import re
    c = re.sub(
        r'top_plants_sql = text\(f""".*?LIMIT 5\s*"""\)',
        new.strip(),
        c, flags=re.DOTALL
    )

with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
