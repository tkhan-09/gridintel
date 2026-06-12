with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()

old = '    kpi, prev_kpi, trend_rows, plant_rows = await asyncio.gather(\n        _kpi(), _prev_kpi(), _trend(), _top_plants()\n    )'
new = '    kpi = await _kpi()\n    prev_kpi = await _prev_kpi()\n    trend_rows = await _trend()\n    plant_rows = await _top_plants()'

c = c.replace(old, new)
with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
