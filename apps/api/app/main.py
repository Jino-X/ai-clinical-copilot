from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import (
    REQUEST_ID_HEADER,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.security import SupabaseTokenVerifier
from app.db.pool import Database
from app.providers.factory import ProviderFactory
from app.services.audit.service import AuditService
from app.services.storage.service import StorageService

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings

    database = Database(settings)
    app.state.database = database

    # One shared client so JWKS fetches and Auth server calls reuse
    # connections instead of completing a TLS handshake per request.
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(10.0),
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
    )
    app.state.http_client = http_client
    app.state.token_verifier = SupabaseTokenVerifier(settings, http_client)
    app.state.audit_service = AuditService(database)
    app.state.storage_service = StorageService(settings)
    app.state.provider_factory = ProviderFactory(settings)

    await database.connect()
    logger.info(
        "api_started",
        environment=settings.environment.value,
        version=settings.version,
    )
    try:
        yield
    finally:
        await http_client.aclose()
        await database.disconnect()
        logger.info("api_stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        title="AI Clinical Copilot API",
        version=settings.version,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    app.state.settings = settings

    # Middleware runs bottom-up, so the request-id context is established
    # first and is therefore available to every log line and error envelope.
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)
    app.include_router(api_router)

    return app


app = create_app()
