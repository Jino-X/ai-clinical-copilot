from fastapi import APIRouter

from app.api.routes import (
    auth,
    clinical_notes,
    consultations,
    health,
    intelligence,
    organizations,
    patients,
)

# Modules are registered here as each phase lands: documents, rag.
api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(patients.router)
api_router.include_router(consultations.router)
api_router.include_router(clinical_notes.router)
api_router.include_router(intelligence.router)
