from __future__ import annotations

import time
from uuid import UUID

from fastapi import APIRouter, Request

from app.api.deps import AuditDep, DatabaseDep, OrganizationDep, TenantConnection
from app.core.errors import NotFoundError, ServiceUnavailableError
from app.core.permissions import Permission
from app.providers.factory import ProviderFactory
from app.repositories.ai_generations import AiGenerationRepository
from app.repositories.consultations import ConsultationRepository
from app.repositories.patients import PatientRepository
from app.schemas.intelligence import (
    PatientQuestionRequest,
    PatientQuestionResponse,
    PatientSummaryResponse,
    VisitComparisonRequest,
    VisitComparisonResponse,
)
from app.services.ai.context_builder import PatientContextBuilder
from app.services.ai.intelligence import IntelligenceService
from app.services.audit.service import AuditAction

router = APIRouter(prefix="/intelligence", tags=["intelligence"])

_patient_repo = PatientRepository()
_consultation_repo = ConsultationRepository()
_ai_repo = AiGenerationRepository()
_context_builder = PatientContextBuilder()


def _get_provider_factory(request: Request) -> ProviderFactory:
    factory: ProviderFactory = request.app.state.provider_factory
    return factory


# ===========================================================================
# Patient summary
# ===========================================================================


@router.post(
    "/patients/{patient_id}/summary",
    response_model=PatientSummaryResponse,
    summary="Generate an AI patient summary",
)
async def generate_patient_summary(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> PatientSummaryResponse:
    """Generate a concise AI summary of the patient's history.

    The summary is a draft for physician review (PRD §12). It includes source
    references so the doctor can verify against the records.
    """
    context.require(Permission.PATIENT_READ)

    patient = await _patient_repo.get(connection, patient_id=patient_id)
    if patient is None:
        raise NotFoundError("Patient not found")

    factory = _get_provider_factory(request)
    if not factory.llm_configured:
        raise ServiceUnavailableError("LLM provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        task_type="patient_summary",
        provider=factory.llm.name,
        model=factory.llm.model,
    )

    start_time = time.monotonic()

    try:
        patient_context = await _context_builder.build_full_context(
            connection, patient_id=patient_id
        )

        service = IntelligenceService(factory.llm)
        result = await service.generate_summary(patient_context=patient_context)

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
            metadata={"task": "patient_summary"},
        )

        return PatientSummaryResponse(
            summary=result.get("summary", ""),
            key_conditions=result.get("key_conditions", []),
            key_medications=result.get("key_medications", []),
            key_allergies=result.get("key_allergies", []),
            recent_activity=result.get("recent_activity"),
            source_references=result.get("source_references", []),
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
# Visit comparison
# ===========================================================================


@router.post(
    "/patients/{patient_id}/compare-visits",
    response_model=VisitComparisonResponse,
    summary="Compare two visits (PRD §7)",
)
async def compare_visits(
    patient_id: UUID,
    payload: VisitComparisonRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> VisitComparisonResponse:
    """Compare a previous visit with the current visit.

    Highlights new, changed, improved, and worsened symptoms, medication
    changes, and important historical changes. Never infers a change without
    supporting patient data (PRD §7).
    """
    context.require(Permission.PATIENT_READ)

    patient = await _patient_repo.get(connection, patient_id=patient_id)
    if patient is None:
        raise NotFoundError("Patient not found")

    # Verify both consultations belong to this patient.
    prev = await _consultation_repo.get(
        connection, consultation_id=payload.previous_consultation_id
    )
    curr = await _consultation_repo.get(
        connection, consultation_id=payload.current_consultation_id
    )
    if prev is None or curr is None:
        raise NotFoundError("Consultation not found")
    if prev.patient_id != patient_id or curr.patient_id != patient_id:
        raise NotFoundError("Consultation does not belong to this patient")

    factory = _get_provider_factory(request)
    if not factory.llm_configured:
        raise ServiceUnavailableError("LLM provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        task_type="visit_comparison",
        provider=factory.llm.name,
        model=factory.llm.model,
    )

    start_time = time.monotonic()

    try:
        prev_context = await _context_builder.build_consultation_context(
            connection, consultation_id=payload.previous_consultation_id
        )
        curr_context = await _context_builder.build_consultation_context(
            connection, consultation_id=payload.current_consultation_id
        )

        service = IntelligenceService(factory.llm)
        result = await service.compare_visits(
            previous_context=prev_context,
            current_context=curr_context,
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
            metadata={"task": "visit_comparison"},
        )

        return VisitComparisonResponse(
            new_symptoms=result.get("new_symptoms", []),
            changed_symptoms=result.get("changed_symptoms", []),
            improved_symptoms=result.get("improved_symptoms", []),
            worsened_symptoms=result.get("worsened_symptoms", []),
            new_medications=result.get("new_medications", []),
            medication_changes=result.get("medication_changes", []),
            important_changes=result.get("important_changes", []),
            narrative=result.get("narrative", ""),
            source_references=result.get("source_references", []),
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
# Patient history Q&A
# ===========================================================================


@router.post(
    "/patients/{patient_id}/ask",
    response_model=PatientQuestionResponse,
    summary="Ask a question about patient history (PRD §8)",
)
async def ask_patient_question(
    patient_id: UUID,
    payload: PatientQuestionRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> PatientQuestionResponse:
    """Answer a doctor's question about the patient's history.

    The AI answers only from authorized patient records and provides source
    references (PRD §8). If information is unavailable, it says so.
    """
    context.require(Permission.PATIENT_READ)

    patient = await _patient_repo.get(connection, patient_id=patient_id)
    if patient is None:
        raise NotFoundError("Patient not found")

    factory = _get_provider_factory(request)
    if not factory.llm_configured:
        raise ServiceUnavailableError("LLM provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        task_type="patient_qa",
        provider=factory.llm.name,
        model=factory.llm.model,
    )

    start_time = time.monotonic()

    try:
        patient_context = await _context_builder.build_full_context(
            connection, patient_id=patient_id
        )

        service = IntelligenceService(factory.llm)
        result = await service.answer_question(
            patient_context=patient_context,
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
            metadata={"task": "patient_qa"},
        )

        return PatientQuestionResponse(
            answer=result.get("answer", ""),
            source_references=result.get("source_references", []),
            provider=factory.llm.name,
            model=factory.llm.model,
        )

    except Exception as exc:
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn, generation_id=gen_id, error_message=str(exc)[:500]
            )
        raise
