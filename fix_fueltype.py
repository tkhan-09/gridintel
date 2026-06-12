with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()
c = c.replace('fuel_type=FuelTypeEnum(r["fuel_type"]),', 'fuel_type=r["fuel_type"],')
with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
