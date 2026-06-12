stub = """
from fastapi import APIRouter
offices_router = APIRouter(prefix="/offices", tags=["Offices"])
companies_router = APIRouter(prefix="/companies", tags=["Companies"])

@offices_router.get("")
@offices_router.get("/")
async def get_offices():
    return []

@companies_router.get("")
@companies_router.get("/")
async def get_companies():
    return []
"""
with open('/app/app/api/v1/offices_companies.py', 'w') as f:
    f.write(stub)
print('Done')
