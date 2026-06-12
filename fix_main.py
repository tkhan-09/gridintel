with open('/app/app/main.py') as f:
    content = f.read()

if 'copilot_router' not in content:
    content = content.replace(
        'from app.api.v1 import auth_and_analytics, billing_and_system, mod_and_operations',
        'from app.api.v1 import auth_and_analytics, billing_and_system, mod_and_operations\nfrom app.api.v1.copilot import copilot_router'
    )
    content = content.replace(
        'app.include_router(mod_and_operations.router, prefix="/api/v1")',
        'app.include_router(mod_and_operations.router, prefix="/api/v1")\napp.include_router(copilot_router, prefix="/api/v1")'
    )
    with open('/app/app/main.py', 'w') as f:
        f.write(content)
    print('Added')
else:
    print('Already exists')
