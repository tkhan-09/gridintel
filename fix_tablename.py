with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()
c = c.replace('energy_balances', 'energy_balance')
with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
