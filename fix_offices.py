stub = """
from fastapi import APIRouter
offices_router = APIRouter(prefix="/offices", tags=["Offices"])
companies_router = APIRouter(prefix="/companies", tags=["Companies"])

@offices_router.get("/")
async def get_offices():
    return []

@companies_router.get("/")
async def get_companies():
    return []
"""
with open('/app/app/api/v1/offices_companies.py', 'w') as f:
    f.write(stub)

with open('/app/app/main.py') as f:
    content = f.read()
if 'offices_router' not in content:
    content = content.replace(
        'from app.api.v1.copilot import copilot_router',
        'from app.api.v1.copilot import copilot_router\nfrom app.api.v1.offices_companies import offices_router, companies_router'
    )
    content = content.replace(
        'app.include_router(copilot_router, prefix="/api/v1")',
        'app.include_router(copilot_router, prefix="/api/v1")\napp.include_router(offices_router, prefix="/api/v1")\napp.include_router(companies_router, prefix="/api/v1")'
    )
    with open('/app/app/main.py', 'w') as f:
        f.write(content)
print('Done')
