with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()
import re
c = re.sub(r'ROUND\(([^,]+),\s*(\d+)\)', r'ROUND(CAST(\1 AS NUMERIC), \2)', c)
with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
