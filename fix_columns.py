with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()

replacements = [
    ('eb.total_generation_mu', 'eb.total_generation_kwh'),
    ('eb.total_import_mu', 'eb.total_import_kwh'),
    ('eb.total_available_mu', 'eb.total_available_energy_kwh'),
    ('eb.total_sales_mu', 'eb.total_utility_sales_kwh'),
    ('eb.total_loss_mu', 'eb.system_loss_kwh'),
    ('eb.auxiliary_mu', '0'),
    ('SUM(eb.total_generation_mu)', 'SUM(eb.total_generation_kwh)'),
    ('SUM(eb.total_import_mu)', 'SUM(eb.total_import_kwh)'),
    ('SUM(eb.total_available_mu)', 'SUM(eb.total_available_energy_kwh)'),
    ('SUM(eb.total_sales_mu)', 'SUM(eb.total_utility_sales_kwh)'),
    ('SUM(eb.total_loss_mu)', 'SUM(eb.system_loss_kwh)'),
    ('SUM(eb.auxiliary_mu)', '0'),
    ('SUM(total_generation_mu)', 'SUM(total_generation_kwh)'),
    ('SUM(total_sales_mu)', 'SUM(total_utility_sales_kwh)'),
    ('SUM(total_loss_mu)', 'SUM(system_loss_kwh)'),
    ('eb.office_id', 'eb.id'),
    ('AND eb.office_id = :oid', ''),
    ('AND eb.office_id = :oid', ''),
]

for old, new in replacements:
    c = c.replace(old, new)

with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
