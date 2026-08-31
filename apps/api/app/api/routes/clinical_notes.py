import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.api.deps import AuditDep, DatabaseDep, OrganizationDep, TenantConnection
from app.core.errors import ConflictError, NotFoundError, ServiceUnavailableError
from app.core.permissions import Permission
from app.providers.factory import ProviderFactory
from app.repositories.ai_generations import AiGenerationRepository
from app.repositories.clinical_notes import ClinicalNoteRepository
from app.repositories.consultations import ConsultationRepository
from app.repositories.transcripts import TranscriptRepository
from app.schemas.clinical_notes import (
    ApproveNoteRequest,
    ClinicalNoteResponse,
    ClinicalNoteSummary,
    EditNoteRequest,
    NoteVersionSource,
    SoapNoteResponse,
    TranscribeRequest,
    TranscribeResponse,
)
from app.services.ai.soap import SoapGenerationService
from app.services.audit.service import AuditAction
from app.services.storage.service import StorageService

router = APIRouter(prefix="/clinical-notes", tags=["clinical-notes"])

_note_repo = ClinicalNoteRepository()
_consultation_repo = ConsultationRepository()
_transcript_repo = TranscriptRepository()
_ai_repo = AiGenerationRepository()


def _get_provider_factory(request: Request) -> ProviderFactory:
    factory: ProviderFactory = request.app.state.provider_factory
    return factory


def _get_storage_service(request: Request) -> StorageService:
    service: StorageService = request.app.state.storage_service
    return service


# ===========================================================================
# List and get
# ===========================================================================


@router.get(
    "",
    response_model=list[ClinicalNoteSummary],
    summary="List clinical notes",
)
async def list_clinical_notes(
    context: OrganizationDep,
    connection: TenantConnection,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ClinicalNoteSummary]:
    context.require(Permission.PATIENT_READ)
    return await _note_repo.list_for_organization(
        connection,
        organization_id=context.organization_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{note_id}",
    response_model=ClinicalNoteResponse,
    summary="Get a clinical note",
)
async def get_clinical_note(
    note_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> ClinicalNoteResponse:
    context.require(Permission.PATIENT_READ)
    note = await _note_repo.get(connection, note_id=note_id)
    if note is None:
        raise NotFoundError("Clinical note not found")
    return note


@router.get(
    "/{note_id}/versions",
    response_model=list[SoapNoteResponse],
    summary="List note versions",
)
async def list_note_versions(
    note_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[SoapNoteResponse]:
    context.require(Permission.PATIENT_READ)
    return await _note_repo.list_versions(connection, note_id=note_id)


# ===========================================================================
# Transcription
# ===========================================================================


@router.post(
    "/consultations/{consultation_id}/transcribe",
    response_model=TranscribeResponse,
    summary="Transcribe consultation audio",
)
async def transcribe_consultation(
    consultation_id: UUID,
    payload: TranscribeRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> TranscribeResponse:
    """Transcribe the consultation's audio file.

    Downloads the audio from Supabase Storage, sends it to the transcription
    provider, and stores the transcript. The original audio is never modified
    (PRD §4). If the AI fails, the consultation data is safe (PRD §24).
    """
    context.require(Permission.CONSULTATION_CONDUCT)

    consultation = await _consultation_repo.get(
        connection, consultation_id=consultation_id
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")
    if consultation.audio_storage_path is None:
        raise ConflictError("No audio attached to this consultation")

    factory = _get_provider_factory(request)
    if not factory.transcription_configured:
        raise ServiceUnavailableError("Transcription is not configured")

    storage = _get_storage_service(request)

    # Record the AI generation attempt.
    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        consultation_id=consultation_id,
        task_type="transcription",
        provider=factory.transcription.name,
        model=factory.transcription.model,
    )

    start_time = time.monotonic()

    try:
        # Get a signed download URL for the audio.
        signed = await storage.create_download_url(
            storage_path=consultation.audio_storage_path
        )

        # Download the audio file.
        import httpx

        async with httpx.AsyncClient(timeout=120) as client:
            audio_response = await client.get(signed.download_url)

        if audio_response.status_code != 200:
            raise ServiceUnavailableError("Could not download audio file")

        audio_data = audio_response.content

        # Transcribe.
        result = await factory.transcription.transcribe(
            audio_data=audio_data,
            content_type=consultation.audio_content_type or "audio/webm",
            language=payload.language,
        )

        duration_ms = int((time.monotonic() - start_time) * 1000)

        # Store the transcript using a privileged connection.
        # `authenticated` has no INSERT grant on transcripts.
        async with database.privileged() as priv_conn:
            transcript = await _transcript_repo.create(
                priv_conn,
                organization_id=context.organization_id,
                consultation_id=consultation_id,
                full_text=result.full_text,
                provider=result.provider,
                model=result.model,
                language=result.language,
                duration_seconds=result.duration_seconds,
            )

            await _ai_repo.mark_completed(
                priv_conn,
                generation_id=gen_id,
                duration_ms=duration_ms,
            )

        await audit.record(
            AuditAction.TRANSCRIPT_GENERATED,
            actor_user_id=context.user.id,
            organization_id=context.organization_id,
            resource_type="transcript",
            resource_id=str(transcript["id"]),
            request=request,
            metadata={"consultation_id": str(consultation_id)},
        )

        return TranscribeResponse(
            transcript_id=transcript["id"],
            full_text=result.full_text,
            provider=result.provider,
            model=result.model,
            language=result.language,
            duration_seconds=result.duration_seconds,
        )

    except Exception as exc:
        # Mark the generation as failed. The consultation data is safe.
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn,
                generation_id=gen_id,
                error_message=str(exc)[:500],
            )
        raise


# ===========================================================================
# SOAP generation
# ===========================================================================


@router.post(
    "/consultations/{consultation_id}/generate-soap",
    response_model=ClinicalNoteResponse,
    summary="Generate a SOAP note draft from the transcript",
)
async def generate_soap(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> ClinicalNoteResponse:
    """Generate a SOAP note draft from the consultation's transcript.

    The generated note is always a draft (PRD §5, §12). Assessment and Plan
    are explicitly marked as requiring doctor confirmation. The original
    transcript is never modified (PRD §4). If the AI fails, the consultation
    data is safe (PRD §24).
    """
    context.require(Permission.CONSULTATION_CONDUCT)

    consultation = await _consultation_repo.get(
        connection, consultation_id=consultation_id
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")

    # Check for an existing note — don't overwrite an approved note.
    existing_note = await _note_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    if existing_note is not None and existing_note.status == "approved":
        raise ConflictError(
            "An approved clinical note already exists for this consultation"
        )

    # Get the transcript.
    transcript = await _transcript_repo.get_by_consultation(
        connection, consultation_id=consultation_id
    )
    if transcript is None:
        raise ConflictError("No transcript found. Transcribe the audio first.")

    factory = _get_provider_factory(request)
    if not factory.llm_configured:
        raise ServiceUnavailableError("LLM provider is not configured")

    gen_id = await _ai_repo.create(
        connection,
        organization_id=context.organization_id,
        consultation_id=consultation_id,
        task_type="soap_generation",
        provider=factory.llm.name,
        model=factory.llm.model,
    )

    start_time = time.monotonic()

    try:
        soap_service = SoapGenerationService(factory.llm)
        soap_content = await soap_service.generate(
            transcript_text=transcript["full_text"]
        )

        duration_ms = int((time.monotonic() - start_time) * 1000)

        # If there's an existing draft note, replace it by creating a new
        # AI-generated version. Otherwise, create a new note.
        if existing_note is not None:
            note = await _note_repo.add_version(
                connection,
                note_id=existing_note.id,
                organization_id=context.organization_id,
                source=NoteVersionSource.AI_GENERATED,
                authored_by=context.user.id,
                content=EditNoteRequest(**soap_content),
            )
        else:
            note = await _note_repo.create_with_author(
                connection,
                organization_id=context.organization_id,
                consultation_id=consultation_id,
                patient_id=consultation.patient_id,
                soap_content=soap_content,
                authored_by=context.user.id,
            )

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
            resource_type="clinical_note",
            resource_id=str(note.id) if note else None,
            request=request,
            metadata={"consultation_id": str(consultation_id)},
        )

        if note is None:
            raise NotFoundError("Could not create clinical note")
        return note

    except Exception as exc:
        async with database.privileged() as priv_conn:
            await _ai_repo.mark_failed(
                priv_conn,
                generation_id=gen_id,
                error_message=str(exc)[:500],
            )
        raise


# ===========================================================================
# Doctor editing, approval, rejection
# ===========================================================================


@router.patch(
    "/{note_id}",
    response_model=ClinicalNoteResponse,
    summary="Edit a clinical note (creates a new version)",
)
async def edit_clinical_note(
    note_id: UUID,
    payload: EditNoteRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ClinicalNoteResponse:
    """Edit a clinical note. Creates a new version (PRD §23).

    The note must not be approved — approved notes are append-only and
    cannot be edited. A new version is created with source='doctor_edited'.
    """
    context.require(Permission.CONSULTATION_CONDUCT)

    note = await _note_repo.get(connection, note_id=note_id)
    if note is None:
        raise NotFoundError("Clinical note not found")
    if note.status == "approved":
        raise ConflictError("Approved clinical notes cannot be edited (PRD §23)")
    if note.status == "rejected":
        raise ConflictError("Rejected notes cannot be edited")

    updated = await _note_repo.add_version(
        connection,
        note_id=note_id,
        organization_id=context.organization_id,
        source=NoteVersionSource.DOCTOR_EDITED,
        authored_by=context.user.id,
        content=payload,
    )
    if updated is None:
        raise NotFoundError("Clinical note not found")

    await audit.record(
        AuditAction.CLINICAL_NOTE_EDITED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="clinical_note",
        resource_id=str(note_id),
        request=request,
        metadata={"version": updated.current_version},
    )

    return updated


@router.post(
    "/{note_id}/approve",
    response_model=ClinicalNoteResponse,
    summary="Approve a clinical note",
)
async def approve_clinical_note(
    note_id: UUID,
    payload: ApproveNoteRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ClinicalNoteResponse:
    """Approve a clinical note. Creates a final version (PRD §23).

    Only clinicians with the clinical_note:approve permission may approve
    notes (PRD §5). The approved version becomes the official clinical record.
    """
    context.require(Permission.CLINICAL_NOTE_APPROVE)

    note = await _note_repo.get(connection, note_id=note_id)
    if note is None:
        raise NotFoundError("Clinical note not found")
    if note.status == "approved":
        raise ConflictError("Note is already approved")
    if note.status == "rejected":
        raise ConflictError("Cannot approve a rejected note")

    # Create a final doctor_approved version with the current content.
    approved = await _note_repo.add_version(
        connection,
        note_id=note_id,
        organization_id=context.organization_id,
        source=NoteVersionSource.DOCTOR_APPROVED,
        authored_by=context.user.id,
        content=EditNoteRequest(edit_note=payload.edit_note),
    )
    if approved is None:
        raise NotFoundError("Clinical note not found")

    await audit.record(
        AuditAction.CLINICAL_NOTE_APPROVED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="clinical_note",
        resource_id=str(note_id),
        request=request,
        metadata={"version": approved.current_version},
    )

    return approved


@router.post(
    "/{note_id}/reject",
    response_model=ClinicalNoteResponse,
    summary="Reject a clinical note draft",
)
async def reject_clinical_note(
    note_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ClinicalNoteResponse:
    """Reject an AI-generated draft. The doctor can then write manually."""
    context.require(Permission.CONSULTATION_CONDUCT)

    note = await _note_repo.reject(
        connection,
        note_id=note_id,
        rejected_by=context.user.id,
    )
    if note is None:
        raise NotFoundError("Clinical note not found or already approved/rejected")

    await audit.record(
        AuditAction.CLINICAL_NOTE_EDITED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="clinical_note",
        resource_id=str(note_id),
        request=request,
        metadata={"action": "rejected"},
    )

    return note
