import app.models
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import create_all_tables, dispose_engine
from app.api.v1 import auth_and_analytics, billing_and_system, mod_and_operations
from app.api.v1.copilot import copilot_router
from app.api.v1.rag import rag_router
from app.api.v1.offices_companies import offices_router, companies_router

app = FastAPI(
    redirect_slashes=False,
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description=settings.APP_DESCRIPTION,
    separate_input_output_schemas=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await create_all_tables()

@app.on_event("shutdown")
async def shutdown():
    await dispose_engine()

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(auth_and_analytics.router, prefix="/api/v1")
app.include_router(billing_and_system.router, prefix="/api/v1")
app.include_router(mod_and_operations.router, prefix="/api/v1")
app.include_router(copilot_router, prefix="/api/v1")
app.include_router(rag_router, prefix="/api/v1")
app.include_router(offices_router, prefix="/api/v1")
app.include_router(companies_router, prefix="/api/v1")