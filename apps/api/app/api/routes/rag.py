from __future__ import annotations

import time
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import AuditDep, DatabaseDep, OrganizationDep, TenantConnection
from app.core.errors import NotFoundError, ServiceUnavailableError
from app.core.permissions import Permission
from app.providers.factory import ProviderFactory
from app.repositories.ai_generations import AiGenerationRepository
from app.repositories.embeddings import EmbeddingRepository
from app.repositories.patients import PatientRepository
from app.services.ai.embedding import EmbeddingService
from app.services.ai.intelligence import IntelligenceService
from app.services.ai.rag import RagService
from app.services.audit.service import AuditAction

router = APIRouter(prefix="/rag", tags=["rag"])

_patient_repo = PatientRepository()
_embedding_repo = EmbeddingRepository()
_ai_repo = AiGenerationRepository()


def _get_provider_factory(request: Request) -> ProviderFactory:
    factory: ProviderFactory = request.app.state.provider_factory
    return factory


# ===========================================================================
# Indexing
# ===========================================================================


class IndexResponse(BaseModel):
    """Result of indexing a patient's records."""
    model_config = ConfigDict(from_attributes=True)

    patient_id: UUID
    chunks_indexed: int
    provider: str
    model: str


@router.post(
    "/patients/{patient_id}/index",
    response_model=IndexResponse,
    summary="Index a patient's records for RAG",
)
async def index_patient(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> IndexResponse:
    """Generate and store embeddings for all of a patient's records.

    Indexes consultations, clinical notes, documents, and medical history.
    Existing embeddings for each source are replaced (no duplicates).
    """
    context.require(Permission.PATIENT_WRITE)

    patient = await _patient_repo.get(connection, patient_id=patient_id)
    if patient is None:
        raise NotFoundError("Patient not found")

    factory = _get_provider_factory(request)
    if not factory.embedding_configured:
        raise ServiceUnavailableError("Embedding provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        task_type="embedding_index",
        provider=factory.embedding.name,
        model=factory.embedding.model,
    )

    start_time = time.monotonic()

    try:
        service = EmbeddingService(factory.embedding)
        count = await service.index_patient(
            connection,
            organization_id=context.organization_id,
            patient_id=patient_id,
        )

        duration_ms = int((time.monotonic() - start_time) * 1000)

        async with database.privileged() as priv_conn:
            await _ai_repo.mark_completed(
                priv_conn, generation_id=gen_id, duration_ms=duration_ms
            )

        await audit.record(
            AuditAction.AI_NOTE_GENERATED,
            actor_user_id=context.user.id,
            organization_id=context.organization_id,
            resource_type="patient",
            resource_id=str(patient_id),
            request=request,
            metadata={"task": "embedding_index", "chunks": count},
        )

        return IndexResponse(
            patient_id=patient_id,
            chunks_indexed=count,
            provider=factory.embedding.name,
            model=factory.embedding.model,
        )

    except Exception as exc:
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn, generation_id=gen_id, error_message=str(exc)[:500]
            )
        raise


# ===========================================================================
# RAG Q&A
# ===========================================================================


class RagQuestionRequest(BaseModel):
    """Doctor asks a question answered via RAG retrieval (PRD §10)."""
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=2000)


class RagSourceReference(BaseModel):
    """A source reference for a RAG answer (PRD §10)."""
    source_type: str
    source_id: UUID
    source_label: str
    similarity: float
    match_type: str


class RagQuestionResponse(BaseModel):
    """RAG-enhanced answer to a patient history question."""
    model_config = ConfigDict(from_attributes=True)

    answer: str
    source_references: list[RagSourceReference]
    provider: str
    model: str


@router.post(
    "/patients/{patient_id}/ask",
    response_model=RagQuestionResponse,
    summary="Ask a question via RAG retrieval (PRD §10)",
)
async def ask_with_rag(
    patient_id: UUID,
    payload: RagQuestionRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> RagQuestionResponse:
    """Answer a doctor's question using RAG retrieval.

    Retrieves the most relevant patient record chunks via hybrid search
    (vector similarity + keyword matching), then generates an answer using
    only the retrieved context. Source references are always included
    (PRD §10). Retrieval is scoped by organization_id and patient_id (PRD §10).
    """
    context.require(Permission.PATIENT_READ)

    patient = await _patient_repo.get(connection, patient_id=patient_id)
    if patient is None:
        raise NotFoundError("Patient not found")

    factory = _get_provider_factory(request)
    if not factory.embedding_configured:
        raise ServiceUnavailableError("Embedding provider is not configured")
    if not factory.llm_configured:
        raise ServiceUnavailableError("LLM provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        task_type="rag_qa",
        provider=factory.llm.name,
        model=factory.llm.model,
    )

    start_time = time.monotonic()

    try:
        # --- Retrieval ----------------------------------------------------
        rag = RagService(factory.embedding)
        results = await rag.retrieve(
            connection,
            organization_id=context.organization_id,
            patient_id=patient_id,
            query=payload.question,
            limit=10,
        )

        # --- Generation ---------------------------------------------------
        context_text = rag.build_context(results)

        intelligence = IntelligenceService(factory.llm)
        result = await intelligence.answer_question(
            patient_context=context_text,
            question=payload.question,
        )

        duration_ms = int((time.monotonic() - start_time) * 1000)

        async with database.privileged() as priv_conn:
            await _ai_repo.mark_completed(
                priv_conn, generation_id=gen_id, duration_ms=duration_ms
            )

        await audit.record(
            AuditAction.AI_NOTE_GENERATED,
            actor_user_id=context.user.id,
            organization_id=context.organization_id,
            resource_type="patient",
            resource_id=str(patient_id),
            request=request,
            metadata={
                "task": "rag_qa",
                "sources": len(results),
            },
        )

        return RagQuestionResponse(
            answer=result.get("answer", ""),
            source_references=[
                RagSourceReference(
                    source_type=r.source_type,
                    source_id=r.source_id,
                    source_label=r.source_label,
                    similarity=r.similarity,
                    match_type=r.match_type,
                )
                for r in results
            ],
            provider=factory.llm.name,
            model=factory.llm.model,
        )

    except Exception as exc:
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn, generation_id=gen_id, error_message=str(exc)[:500]
            )
        raise


# ===========================================================================
# Index status
# ===========================================================================


class IndexStatusResponse(BaseModel):
    """Status of a patient's embedding index."""
    model_config = ConfigDict(from_attributes=True)

    patient_id: UUID
    embedding_count: int


@router.get(
    "/patients/{patient_id}/index-status",
    response_model=IndexStatusResponse,
    summary="Check embedding index status for a patient",
)
async def index_status(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> IndexStatusResponse:
    context.require(Permission.PATIENT_READ)
    count = await _embedding_repo.count_for_patient(
        connection, patient_id=patient_id
    )
    return IndexStatusResponse(
        patient_id=patient_id,
        embedding_count=count,
    )
