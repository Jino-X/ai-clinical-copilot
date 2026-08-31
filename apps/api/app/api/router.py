from fastapi import APIRouter

from app.api.routes import (
    auth,
    clinical_notes,
    consultations,
    documents,
    health,
    intelligence,
    local_ai,
    organizations,
    patients,
    rag,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(patients.router)
api_router.include_router(consultations.router)
api_router.include_router(clinical_notes.router)
api_router.include_router(intelligence.router)
api_router.include_router(documents.router)
api_router.include_router(rag.router)
api_router.include_router(local_ai.router)
