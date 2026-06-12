with open('/app/app/api/v1/billing_and_system.py') as f:
    content = f.read()
print([x for x in content.split('\n') if 'notification' in x.lower()][:5])
