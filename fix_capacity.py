with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()
c = c.replace('p.installed_capacity_mw', 'p.capacity_mw')
c = c.replace('p.is_active', 'p.status')
c = c.replace("p.status = TRUE", "p.status = 'Active'")
with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
