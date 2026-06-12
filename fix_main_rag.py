with open('/app/app/main.py') as f:
    content = f.read()
if 'rag_router' not in content:
    content = content.replace(
        'from app.api.v1.copilot import copilot_router',
        'from app.api.v1.copilot import copilot_router\nfrom app.api.v1.rag import rag_router'
    )
    content = content.replace(
        'app.include_router(copilot_router, prefix="/api/v1")',
        'app.include_router(copilot_router, prefix="/api/v1")\napp.include_router(rag_router, prefix="/api/v1")'
    )
    with open('/app/app/main.py', 'w') as f:
        f.write(content)
    print('Added rag_router')
else:
    print('Already exists')
