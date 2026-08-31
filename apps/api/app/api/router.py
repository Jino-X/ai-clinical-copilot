from fastapi import APIRouter

from app.api.routes import auth, health, organizations

# Modules are registered here as each phase lands: patients, consultations,
# clinical_records, documents, ai, rag.
api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(organizations.router)
