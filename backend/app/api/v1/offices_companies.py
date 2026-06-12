from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.office import Office

offices_router = APIRouter(prefix="/offices", tags=["Offices"])
companies_router = APIRouter(prefix="/companies", tags=["Companies"])

@offices_router.get("")
@offices_router.get("/")
async def get_offices(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Office).order_by(Office.name))
    offices = result.scalars().all()
    return [{"id": o.id, "name": o.name} for o in offices]

@companies_router.get("")
@companies_router.get("/")
async def get_companies():
    return []