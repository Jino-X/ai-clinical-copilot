from __future__ import annotations

import time
from uuid import UUID

from fastapi import APIRouter, Request

from app.api.deps import AuditDep, DatabaseDep, OrganizationDep, TenantConnection
from app.core.errors import ConflictError, NotFoundError, ServiceUnavailableError
from app.core.permissions import Permission
from app.providers.factory import ProviderFactory
from app.repositories.ai_generations import AiGenerationRepository
from app.repositories.clinical_extractions import ClinicalExtractionRepository
from app.repositories.consultations import ConsultationRepository
from app.repositories.doctor_summaries import DoctorSummaryRepository
from app.repositories.transcripts import TranscriptRepository
from app.schemas.clinical_extraction import (
    ClinicalExtraction,
    ComparisonResponse,
    DoctorSummaryResponse,
    ExtractResponse,
    NormalizeResponse,
    ProcessingStage,
    ProcessingStatusResponse,
)
from app.services.ai.clinical_extraction import ClinicalExtractionService
from app.services.ai.comparison import VisitComparisonService
from app.services.ai.context_builder import PatientContextBuilder
from app.services.ai.doctor_summary import DoctorSummaryService
from app.services.audit.service import AuditAction

router = APIRouter(prefix="/consultations", tags=["local-ai"])

_consultation_repo = ConsultationRepository()
_transcript_repo = TranscriptRepository()
_extraction_repo = ClinicalExtractionRepository()
_summary_repo = DoctorSummaryRepository()
_ai_repo = AiGenerationRepository()
_context_builder = PatientContextBuilder()


def _get_provider_factory(request: Request) -> ProviderFactory:
    factory: ProviderFactory = request.app.state.provider_factory
    return factory


# ===========================================================================
# Processing status
# ===========================================================================


@router.get(
    "/{consultation_id}/processing-status",
    response_model=ProcessingStatusResponse,
    summary="Get the AI processing status for a consultation",
)
async def get_processing_status(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> ProcessingStatusResponse:
    """Return the current processing stage of the consultation AI pipeline."""
    context.require(Permission.PATIENT_READ)

    consultation = await _consultation_repo.get(
        connection, consultation_id=consultation_id
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")

    transcript = await _transcript_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    extraction = await _extraction_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    summary = await _summary_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )

    has_transcript = transcript is not None
    has_english = bool(transcript and transcript.get("english_text"))
    has_extraction = extraction is not None
    has_summary = summary is not None

    if has_summary or has_extraction or has_english or has_transcript:
        stage = ProcessingStage.READY
    else:
        stage = ProcessingStage.IDLE

    return ProcessingStatusResponse(
        stage=stage,
        has_transcript=has_transcript,
        has_english_transcript=has_english,
        has_extraction=has_extraction,
        has_summary=has_summary,
    )


# ===========================================================================
# English normalization
# ===========================================================================


@router.post(
    "/{consultation_id}/normalize",
    response_model=NormalizeResponse,
    summary="Normalize transcript to English (PRD §5)",
)
async def normalize_transcript(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> NormalizeResponse:
    """Translate the consultation transcript to English.

    The original transcript is never modified (PRD §4). The English-normalized
    text is stored in a separate column on the transcript row. If translation
    fails, the original transcript is preserved and the doctor can retry.
    """
    context.require(Permission.CONSULTATION_CONDUCT)

    consultation = await _consultation_repo.get(
        connection, consultation_id=consultation_id
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")

    transcript = await _transcript_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    if transcript is None:
        raise ConflictError("No transcript found. Transcribe the audio first.")

    factory = _get_provider_factory(request)
    if not factory.translation_configured:
        raise ServiceUnavailableError("Translation provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        consultation_id=consultation_id,
        task_type="translation",
        provider=factory.translation.name,
        model=factory.translation.model,
    )

    start_time = time.monotonic()

    try:
        result = await factory.translation.translate_to_english(
            text=transcript["full_text"],
            source_language=transcript.get("language"),
        )

        duration_ms = int((time.monotonic() - start_time) * 1000)

        async with database.privileged() as priv_conn:
            await _transcript_repo.update_english_text(
                priv_conn,
                transcript_id=transcript["id"],
                english_text=result.full_text,
                provider=result.provider,
                model=result.model,
                source_language=result.source_language,
            )

            await _ai_repo.mark_completed(
                priv_conn,
                generation_id=gen_id,
                duration_ms=duration_ms,
            )

        await audit.record(
            AuditAction.AI_NOTE_GENERATED,
            actor_user_id=context.user.id,
            organization_id=context.organization_id,
            resource_type="transcript",
            resource_id=str(transcript["id"]),
            request=request,
            metadata={"task": "translation"},
        )

        return NormalizeResponse(
            transcript_id=transcript["id"],
            english_text=result.full_text,
            provider=result.provider,
            model=result.model,
            source_language=result.source_language,
        )

    except Exception as exc:
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn,
                generation_id=gen_id,
                error_message=str(exc)[:500],
            )
        raise


# ===========================================================================
# Clinical extraction
# ===========================================================================


@router.post(
    "/{consultation_id}/extract",
    response_model=ExtractResponse,
    summary="Extract clinical information from the transcript (PRD §7)",
)
async def extract_clinical_info(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> ExtractResponse:
    """Extract structured clinical information from the English transcript.

    Uses the configured LLM (Ollama/Qwen3 for local dev) with structured JSON
    output. The extraction is validated against a Pydantic schema. If the LLM
    fails, the transcript is preserved and the doctor can enter a manual note.
    """
    context.require(Permission.CONSULTATION_CONDUCT)

    consultation = await _consultation_repo.get(
        connection, consultation_id=consultation_id
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")

    transcript = await _transcript_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    if transcript is None:
        raise ConflictError("No transcript found. Transcribe the audio first.")

    # Use the English-normalized text if available, otherwise the original.
    input_text = transcript.get("english_text") or transcript["full_text"]

    factory = _get_provider_factory(request)
    if not factory.llm_configured:
        raise ServiceUnavailableError("LLM provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        consultation_id=consultation_id,
        task_type="clinical_extraction",
        provider=factory.llm.name,
        model=factory.llm.model,
    )

    start_time = time.monotonic()

    try:
        service = ClinicalExtractionService(factory.llm)
        extraction = await service.extract(english_transcript=input_text)

        duration_ms = int((time.monotonic() - start_time) * 1000)

        async with database.privileged() as priv_conn:
            row = await _extraction_repo.create(
                priv_conn,
                organization_id=context.organization_id,
                consultation_id=consultation_id,
                patient_id=consultation.patient_id,
                transcript_id=transcript["id"],
                extraction=extraction.model_dump(),
                input_text=input_text,
                provider=factory.llm.name,
                model=factory.llm.model,
            )

            await _ai_repo.mark_completed(
                priv_conn,
                generation_id=gen_id,
                duration_ms=duration_ms,
            )

        await audit.record(
            AuditAction.AI_NOTE_GENERATED,
            actor_user_id=context.user.id,
            organization_id=context.organization_id,
            resource_type="clinical_extraction",
            resource_id=str(row["id"]),
            request=request,
            metadata={"task": "clinical_extraction"},
        )

        return ExtractResponse(
            extraction_id=row["id"],
            extraction=extraction,
            provider=factory.llm.name,
            model=factory.llm.model,
        )

    except Exception as exc:
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn,
                generation_id=gen_id,
                error_message=str(exc)[:500],
            )
        raise


# ===========================================================================
# Visit comparison
# ===========================================================================


@router.post(
    "/{consultation_id}/compare",
    response_model=ComparisonResponse,
    summary="Compare current visit with previous records (PRD §9)",
)
async def compare_visits(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> ComparisonResponse:
    """Compare the current consultation with previous patient records.

    The backend retrieves previous patient data from Supabase and passes it
    to the LLM along with the current extraction. The LLM never accesses the
    database directly (PRD §20). Only changes supported by available records
    are reported (PRD §12).
    """
    context.require(Permission.PATIENT_READ)

    consultation = await _consultation_repo.get(
        connection, consultation_id=consultation_id
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")

    extraction_row = await _extraction_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    if extraction_row is None:
        raise ConflictError(
            "No clinical extraction found. Extract clinical information first."
        )

    factory = _get_provider_factory(request)
    if not factory.llm_configured:
        raise ServiceUnavailableError("LLM provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        consultation_id=consultation_id,
        task_type="visit_comparison",
        provider=factory.llm.name,
        model=factory.llm.model,
    )

    start_time = time.monotonic()

    try:
        # Build previous patient context from Supabase (PRD §8, §20).
        previous_context = await _context_builder.build_full_context(
            connection, patient_id=consultation.patient_id
        )

        current_extraction = ClinicalExtraction.model_validate(
            extraction_row["extraction"]
        )

        service = VisitComparisonService(factory.llm)
        comparison = await service.compare(
            current_extraction=current_extraction,
            previous_context=previous_context,
        )

        duration_ms = int((time.monotonic() - start_time) * 1000)

        async with database.privileged() as priv_conn:
            await _ai_repo.mark_completed(
                priv_conn,
                generation_id=gen_id,
                duration_ms=duration_ms,
            )

        await audit.record(
            AuditAction.AI_NOTE_GENERATED,
            actor_user_id=context.user.id,
            organization_id=context.organization_id,
            resource_type="consultation",
            resource_id=str(consultation_id),
            request=request,
            metadata={"task": "visit_comparison"},
        )

        return ComparisonResponse(
            comparison=comparison,
            provider=factory.llm.name,
            model=factory.llm.model,
        )

    except Exception as exc:
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn,
                generation_id=gen_id,
                error_message=str(exc)[:500],
            )
        raise


# ===========================================================================
# Doctor-facing summary
# ===========================================================================


@router.post(
    "/{consultation_id}/summary",
    response_model=DoctorSummaryResponse,
    summary="Generate a doctor-facing summary (PRD §10)",
)
async def generate_summary(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> DoctorSummaryResponse:
    """Generate a concise doctor-facing summary.

    Combines current consultation extraction, visit comparison, and existing
    patient records from Supabase. The LLM synthesizes the provided data into
    a readable summary — it does not access the database directly (PRD §20).
    The summary is always a draft for physician review (PRD §12).
    """
    context.require(Permission.PATIENT_READ)

    consultation = await _consultation_repo.get(
        connection, consultation_id=consultation_id
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")

    extraction_row = await _extraction_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    if extraction_row is None:
        raise ConflictError(
            "No clinical extraction found. Extract clinical information first."
        )

    factory = _get_provider_factory(request)
    if not factory.llm_configured:
        raise ServiceUnavailableError("LLM provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        consultation_id=consultation_id,
        task_type="doctor_summary",
        provider=factory.llm.name,
        model=factory.llm.model,
    )

    start_time = time.monotonic()

    try:
        # Build patient context from Supabase (PRD §8, §20).
        patient_context = await _context_builder.build_full_context(
            connection, patient_id=consultation.patient_id
        )

        current_extraction = ClinicalExtraction.model_validate(
            extraction_row["extraction"]
        )

        # Generate visit comparison first.
        comparison_service = VisitComparisonService(factory.llm)
        comparison = await comparison_service.compare(
            current_extraction=current_extraction,
            previous_context=patient_context,
        )

        # Generate the summary.
        summary_service = DoctorSummaryService(factory.llm)
        summary_text, source_refs = await summary_service.generate(
            patient_context=patient_context,
            current_extraction=current_extraction,
            comparison=comparison,
        )

        duration_ms = int((time.monotonic() - start_time) * 1000)

        async with database.privileged() as priv_conn:
            await _summary_repo.create(
                priv_conn,
                organization_id=context.organization_id,
                consultation_id=consultation_id,
                patient_id=consultation.patient_id,
                summary=summary_text,
                source_references=source_refs,
                provider=factory.llm.name,
                model=factory.llm.model,
            )

            await _ai_repo.mark_completed(
                priv_conn,
                generation_id=gen_id,
                duration_ms=duration_ms,
            )

        await audit.record(
            AuditAction.AI_NOTE_GENERATED,
            actor_user_id=context.user.id,
            organization_id=context.organization_id,
            resource_type="consultation",
            resource_id=str(consultation_id),
            request=request,
            metadata={"task": "doctor_summary"},
        )

        return DoctorSummaryResponse(
            summary=summary_text,
            source_references=source_refs,
            provider=factory.llm.name,
            model=factory.llm.model,
        )

    except Exception as exc:
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn,
                generation_id=gen_id,
                error_message=str(exc)[:500],
            )
        raise


# ===========================================================================
# Get extraction and summary (for frontend display)
# ===========================================================================


@router.get(
    "/{consultation_id}/extraction",
    response_model=ExtractResponse | None,
    summary="Get the clinical extraction for a consultation",
)
async def get_extraction(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> ExtractResponse | None:
    context.require(Permission.PATIENT_READ)

    row = await _extraction_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    if row is None:
        return None

    import json
    
    # The extraction field is stored as JSONB but asyncpg returns it as a string
    extraction_data = row["extraction"]
    if isinstance(extraction_data, str):
        extraction_data = json.loads(extraction_data)
    
    return ExtractResponse(
        extraction_id=row["id"],
        extraction=ClinicalExtraction.model_validate(extraction_data),
        provider=row["provider"],
        model=row["model"],
    )


@router.get(
    "/{consultation_id}/summary",
    response_model=DoctorSummaryResponse | None,
    summary="Get the doctor-facing summary for a consultation",
)
async def get_summary(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> DoctorSummaryResponse | None:
    context.require(Permission.PATIENT_READ)

    row = await _summary_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    if row is None:
        return None

    import json
    
    # source_references is stored as JSONB but asyncpg returns it as a string
    source_refs = row["source_references"]
    if isinstance(source_refs, str):
        source_refs = json.loads(source_refs)
    
    return DoctorSummaryResponse(
        summary=row["summary"],
        source_references=source_refs,
        provider=row["provider"],
        model=row["model"],
    )
