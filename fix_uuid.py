with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()
c = c.replace('plant_id=uuid.UUID(str(r["plant_id"])),', 'plant_id=str(r["plant_id"]),')
with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
