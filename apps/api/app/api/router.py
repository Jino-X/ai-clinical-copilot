from fastapi import APIRouter

from app.api.routes import health

# Modules are registered here as each phase lands: organizations, patients,
# consultations, clinical_records, documents, ai, rag, audit.
api_router = APIRouter()
api_router.include_router(health.router)
