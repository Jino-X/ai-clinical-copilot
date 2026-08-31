from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, status

from app.api.deps import AuditDep, OrganizationDep, TenantConnection
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError
from app.core.permissions import Permission
from app.repositories.consultations import ConsultationRepository
from app.repositories.patients import PatientRepository
from app.schemas.consultations import (
    AudioUrlResponse,
    ConfirmUploadRequest,
    ConsentResponse,
    ConsultationResponse,
    ConsultationStatus,
    ConsultationSummary,
    CreateConsultationRequest,
    CreateUploadUrlRequest,
    CreateUploadUrlResponse,
    GrantConsentRequest,
    UpdateConsultationRequest,
)
from app.services.audit.service import AuditAction
from app.services.storage.service import StorageService

router = APIRouter(prefix="/consultations", tags=["consultations"])

_repo = ConsultationRepository()
_patient_repo = PatientRepository()


def _get_storage_service(request: Request) -> StorageService:
    service: StorageService = request.app.state.storage_service
    return service


# ===========================================================================
# Consultation CRUD + state transitions
# ===========================================================================


@router.get(
    "",
    response_model=list[ConsultationSummary],
    summary="List consultations",
)
async def list_consultations(
    context: OrganizationDep,
    connection: TenantConnection,
    status_filter: Annotated[ConsultationStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ConsultationSummary]:
    context.require(Permission.PATIENT_READ)
    return await _repo.list_for_organization(
        connection,
        organization_id=context.organization_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{consultation_id}",
    response_model=ConsultationResponse,
    summary="Get a consultation",
)
async def get_consultation(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> ConsultationResponse:
    context.require(Permission.PATIENT_READ)
    consultation = await _repo.get(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found")
    return consultation


@router.post(
    "",
    response_model=ConsultationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create (schedule) a consultation",
)
async def create_consultation(
    payload: CreateConsultationRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ConsultationResponse:
    context.require(Permission.CONSULTATION_CONDUCT)

    # Verify the patient exists and belongs to the caller's organization.
    # RLS would hide a cross-tenant patient, but we check explicitly so the
    # error message is clear rather than a generic "not found".
    patient = await _patient_repo.get(connection, patient_id=payload.patient_id)
    if patient is None or patient.organization_id != context.organization_id:
        raise NotFoundError("Patient not found")

    consultation = await _repo.create(
        connection,
        organization_id=context.organization_id,
        patient_id=payload.patient_id,
        doctor_id=context.user.id,
        payload=payload,
    )
    await audit.record(
        AuditAction.CONSULTATION_STARTED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="consultation",
        resource_id=str(consultation.id),
        request=request,
        # Identifiers only, never clinical content (PRD §19).
        metadata={"patient_id": str(payload.patient_id)},
    )
    return consultation


@router.patch(
    "/{consultation_id}",
    response_model=ConsultationResponse,
    summary="Update consultation notes",
)
async def update_consultation(
    consultation_id: UUID,
    payload: UpdateConsultationRequest,
    context: OrganizationDep,
    connection: TenantConnection,
) -> ConsultationResponse:
    context.require(Permission.CONSULTATION_CONDUCT)
    consultation = await _repo.update(
        connection, consultation_id=consultation_id, payload=payload
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")
    return consultation


@router.post(
    "/{consultation_id}/start",
    response_model=ConsultationResponse,
    summary="Start a scheduled consultation",
)
async def start_consultation(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ConsultationResponse:
    context.require(Permission.CONSULTATION_CONDUCT)
    consultation = await _repo.start(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found or not in scheduled state")
    await audit.record(
        AuditAction.CONSULTATION_STARTED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="consultation",
        resource_id=str(consultation_id),
        request=request,
    )
    return consultation


@router.post(
    "/{consultation_id}/complete",
    response_model=ConsultationResponse,
    summary="Complete an in-progress consultation",
)
async def complete_consultation(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ConsultationResponse:
    context.require(Permission.CONSULTATION_CONDUCT)
    consultation = await _repo.complete(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found or not in progress")
    await audit.record(
        AuditAction.CONSULTATION_COMPLETED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="consultation",
        resource_id=str(consultation_id),
        request=request,
    )
    return consultation


@router.post(
    "/{consultation_id}/cancel",
    response_model=ConsultationResponse,
    summary="Cancel a consultation",
)
async def cancel_consultation(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ConsultationResponse:
    context.require(Permission.CONSULTATION_CONDUCT)
    consultation = await _repo.cancel(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found or already completed/cancelled")
    await audit.record(
        AuditAction.CONSULTATION_COMPLETED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="consultation",
        resource_id=str(consultation_id),
        request=request,
        metadata={"action": "cancelled"},
    )
    return consultation


# ===========================================================================
# Audio upload (direct-to-storage via signed URLs)
# ===========================================================================


@router.post(
    "/{consultation_id}/audio/upload-url",
    response_model=CreateUploadUrlResponse,
    summary="Get a signed URL for uploading audio",
)
async def create_audio_upload_url(
    consultation_id: UUID,
    payload: CreateUploadUrlRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    request: Request,
) -> CreateUploadUrlResponse:
    context.require(Permission.CONSULTATION_CONDUCT)

    consultation = await _repo.get(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found")

    # Only the conducting doctor may upload audio for this consultation.
    if consultation.doctor_id != context.user.id:
        raise PermissionDeniedError("Only the conducting clinician may upload audio")

    storage = _get_storage_service(request)
    signed = await storage.create_upload_url(
        organization_id=str(context.organization_id),
        consultation_id=str(consultation_id),
        content_type=payload.content_type,
    )
    return CreateUploadUrlResponse(
        upload_url=signed.upload_url,
        storage_path=signed.storage_path,
        expires_at=signed.expires_at,
    )


@router.post(
    "/{consultation_id}/audio/confirm",
    response_model=ConsultationResponse,
    summary="Confirm audio upload and attach to consultation",
)
async def confirm_audio_upload(
    consultation_id: UUID,
    payload: ConfirmUploadRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ConsultationResponse:
    context.require(Permission.CONSULTATION_CONDUCT)

    consultation = await _repo.get(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found")
    if consultation.doctor_id != context.user.id:
        raise PermissionDeniedError("Only the conducting clinician may attach audio")

    consultation = await _repo.attach_audio(
        connection,
        consultation_id=consultation_id,
        storage_path=payload.storage_path,
        content_type=payload.content_type,
        file_size_bytes=payload.file_size_bytes,
    )
    if consultation is None:
        raise NotFoundError("Consultation not found")
    await audit.record(
        AuditAction.CONSULTATION_STARTED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="consultation",
        resource_id=str(consultation_id),
        request=request,
        metadata={"action": "audio_attached"},
    )
    return consultation


@router.get(
    "/{consultation_id}/audio/download-url",
    response_model=AudioUrlResponse,
    summary="Get a signed URL for downloading audio",
)
async def get_audio_download_url(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    request: Request,
) -> AudioUrlResponse:
    context.require(Permission.PATIENT_READ)

    consultation = await _repo.get(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found")
    if consultation.audio_storage_path is None:
        raise NotFoundError("No audio attached to this consultation")

    storage = _get_storage_service(request)
    signed = await storage.create_download_url(
        storage_path=consultation.audio_storage_path
    )
    return AudioUrlResponse(
        download_url=signed.download_url,
        expires_at=signed.expires_at,
        content_type=signed.content_type,
        size_bytes=signed.size_bytes,
    )


# ===========================================================================
# Consent
# ===========================================================================


@router.get(
    "/{consultation_id}/consents",
    response_model=list[ConsentResponse],
    summary="List consents for a consultation",
)
async def list_consents(
    consultation_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[ConsentResponse]:
    context.require(Permission.PATIENT_READ)
    consultation = await _repo.get(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found")
    return await _repo.list_consents(connection, patient_id=consultation.patient_id)


@router.post(
    "/{consultation_id}/consents/grant",
    response_model=ConsentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Grant consent for a consultation",
)
async def grant_consent(
    consultation_id: UUID,
    payload: GrantConsentRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ConsentResponse:
    context.require(Permission.CONSULTATION_CONDUCT)

    consultation = await _repo.get(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found")

    # Ensure the consent is for the same patient as the consultation.
    if payload.patient_id != consultation.patient_id:
        raise ConflictError("Consent patient does not match consultation patient")

    consent = await _repo.grant_consent(
        connection,
        organization_id=context.organization_id,
        recorded_by=context.user.id,
        payload=payload,
    )
    await audit.record(
        AuditAction.CONSULTATION_STARTED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="consent",
        resource_id=str(consent.id),
        request=request,
        metadata={
            "consent_type": payload.consent_type.value,
            "granted": True,
        },
    )
    return consent


@router.post(
    "/{consultation_id}/consents/revoke",
    response_model=ConsentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Revoke consent for a consultation",
)
async def revoke_consent(
    consultation_id: UUID,
    payload: GrantConsentRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> ConsentResponse:
    context.require(Permission.CONSULTATION_CONDUCT)

    consultation = await _repo.get(connection, consultation_id=consultation_id)
    if consultation is None:
        raise NotFoundError("Consultation not found")
    if payload.patient_id != consultation.patient_id:
        raise ConflictError("Consent patient does not match consultation patient")

    consent = await _repo.revoke_consent(
        connection,
        organization_id=context.organization_id,
        recorded_by=context.user.id,
        payload=payload,
    )
    await audit.record(
        AuditAction.CONSULTATION_STARTED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="consent",
        resource_id=str(consent.id),
        request=request,
        metadata={
            "consent_type": payload.consent_type.value,
            "granted": False,
        },
    )
    return consent
