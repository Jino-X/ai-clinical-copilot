from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, status

from app.api.deps import AuditDep, OrganizationDep, TenantConnection
from app.core.errors import NotFoundError
from app.core.permissions import Permission
from app.repositories.consultations import ConsultationRepository
from app.repositories.patients import PatientRepository
from app.schemas.consultations import ConsultationSummary
from app.schemas.patients import (
    AllergyResponse,
    ConditionResponse,
    CreateAllergyRequest,
    CreateConditionRequest,
    CreateMedicationRequest,
    CreatePatientContactRequest,
    CreatePatientRequest,
    MedicationResponse,
    PatientContactResponse,
    PatientResponse,
    PatientSummary,
    TimelineEventResponse,
    UpdatePatientRequest,
)
from app.services.audit.service import AuditAction

router = APIRouter(prefix="/patients", tags=["patients"])

_repo = PatientRepository()
_consultation_repo = ConsultationRepository()


def _require_patient_access(context: OrganizationDep) -> None:
    """Patient records require at least patient:read. The dependency
    `requires()` is used at the route level for write operations; this
    helper is for inline checks where the permission varies by method.
    """
    context.require(Permission.PATIENT_READ)


# ===========================================================================
# Patient CRUD
# ===========================================================================


@router.get("", response_model=list[PatientSummary], summary="List patients")
async def list_patients(
    context: OrganizationDep,
    connection: TenantConnection,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[PatientSummary]:
    _require_patient_access(context)
    return await _repo.list_patients(
        connection,
        organization_id=context.organization_id,
        limit=limit,
        offset=offset,
    )


@router.get("/search", response_model=list[PatientSummary], summary="Search patients")
async def search_patients(
    context: OrganizationDep,
    connection: TenantConnection,
    q: Annotated[str, Query(min_length=1, max_length=200)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[PatientSummary]:
    _require_patient_access(context)
    return await _repo.search(
        connection,
        organization_id=context.organization_id,
        query=q,
        limit=limit,
    )


@router.post(
    "",
    response_model=PatientResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a patient",
)
async def create_patient(
    payload: CreatePatientRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> PatientResponse:
    context.require(Permission.PATIENT_WRITE)
    patient = await _repo.create(
        connection,
        organization_id=context.organization_id,
        payload=payload,
    )
    await audit.record(
        AuditAction.PATIENT_CREATED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="patient",
        resource_id=str(patient.id),
        request=request,
    )
    return patient


@router.get(
    "/{patient_id}",
    response_model=PatientResponse,
    summary="Get a patient",
)
async def get_patient(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> PatientResponse:
    _require_patient_access(context)
    patient = await _repo.get(connection, patient_id=patient_id)
    if patient is None:
        raise NotFoundError("Patient not found")
    await audit.record(
        AuditAction.PATIENT_VIEWED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="patient",
        resource_id=str(patient_id),
        request=request,
    )
    return patient


@router.patch(
    "/{patient_id}",
    response_model=PatientResponse,
    summary="Update a patient",
)
async def update_patient(
    patient_id: UUID,
    payload: UpdatePatientRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> PatientResponse:
    context.require(Permission.PATIENT_WRITE)
    patient = await _repo.update(connection, patient_id=patient_id, payload=payload)
    if patient is None:
        raise NotFoundError("Patient not found")
    await audit.record(
        AuditAction.PATIENT_UPDATED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="patient",
        resource_id=str(patient_id),
        request=request,
        # Field names only — values may be PHI (PRD §19).
        metadata={"fields": sorted(payload.model_dump(exclude_none=True).keys())},
    )
    return patient


@router.delete(
    "/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a patient (soft delete)",
)
async def delete_patient(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> None:
    context.require(Permission.PATIENT_WRITE)
    removed = await _repo.soft_delete(connection, patient_id=patient_id)
    if not removed:
        raise NotFoundError("Patient not found")
    await audit.record(
        AuditAction.PATIENT_UPDATED,
        actor_user_id=context.user.id,
        organization_id=context.organization_id,
        resource_type="patient",
        resource_id=str(patient_id),
        request=request,
        metadata={"action": "soft_delete"},
    )


# ===========================================================================
# Patient contacts
# ===========================================================================


@router.get(
    "/{patient_id}/contacts",
    response_model=list[PatientContactResponse],
    summary="List patient contacts",
)
async def list_contacts(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[PatientContactResponse]:
    _require_patient_access(context)
    return await _repo.list_contacts(connection, patient_id=patient_id)


@router.post(
    "/{patient_id}/contacts",
    response_model=PatientContactResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a patient contact",
)
async def add_contact(
    patient_id: UUID,
    payload: CreatePatientContactRequest,
    context: OrganizationDep,
    connection: TenantConnection,
) -> PatientContactResponse:
    context.require(Permission.PATIENT_WRITE)
    return await _repo.add_contact(
        connection,
        patient_id=patient_id,
        organization_id=context.organization_id,
        payload=payload,
    )


@router.delete(
    "/{patient_id}/contacts/{contact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a patient contact",
)
async def remove_contact(
    patient_id: UUID,
    contact_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> None:
    context.require(Permission.PATIENT_WRITE)
    removed = await _repo.remove_contact(connection, contact_id=contact_id)
    if not removed:
        raise NotFoundError("Contact not found")


# ===========================================================================
# Medical history: conditions, medications, allergies
# ===========================================================================


@router.get(
    "/{patient_id}/conditions",
    response_model=list[ConditionResponse],
    summary="List patient conditions",
)
async def list_conditions(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[ConditionResponse]:
    _require_patient_access(context)
    return await _repo.list_conditions(connection, patient_id=patient_id)


@router.post(
    "/{patient_id}/conditions",
    response_model=ConditionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a condition",
)
async def add_condition(
    patient_id: UUID,
    payload: CreateConditionRequest,
    context: OrganizationDep,
    connection: TenantConnection,
) -> ConditionResponse:
    context.require(Permission.PATIENT_WRITE)
    return await _repo.add_condition(
        connection,
        patient_id=patient_id,
        organization_id=context.organization_id,
        created_by=context.user.id,
        payload=payload,
    )


@router.delete(
    "/{patient_id}/conditions/{condition_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a condition",
)
async def remove_condition(
    patient_id: UUID,
    condition_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> None:
    context.require(Permission.PATIENT_WRITE)
    removed = await _repo.remove_condition(connection, condition_id=condition_id)
    if not removed:
        raise NotFoundError("Condition not found")


@router.get(
    "/{patient_id}/medications",
    response_model=list[MedicationResponse],
    summary="List patient medications",
)
async def list_medications(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[MedicationResponse]:
    _require_patient_access(context)
    return await _repo.list_medications(connection, patient_id=patient_id)


@router.post(
    "/{patient_id}/medications",
    response_model=MedicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a medication",
)
async def add_medication(
    patient_id: UUID,
    payload: CreateMedicationRequest,
    context: OrganizationDep,
    connection: TenantConnection,
) -> MedicationResponse:
    context.require(Permission.PATIENT_WRITE)
    return await _repo.add_medication(
        connection,
        patient_id=patient_id,
        organization_id=context.organization_id,
        created_by=context.user.id,
        payload=payload,
    )


@router.delete(
    "/{patient_id}/medications/{medication_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a medication",
)
async def remove_medication(
    patient_id: UUID,
    medication_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> None:
    context.require(Permission.PATIENT_WRITE)
    removed = await _repo.remove_medication(connection, medication_id=medication_id)
    if not removed:
        raise NotFoundError("Medication not found")


@router.get(
    "/{patient_id}/allergies",
    response_model=list[AllergyResponse],
    summary="List patient allergies",
)
async def list_allergies(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[AllergyResponse]:
    _require_patient_access(context)
    return await _repo.list_allergies(connection, patient_id=patient_id)


@router.post(
    "/{patient_id}/allergies",
    response_model=AllergyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add an allergy",
)
async def add_allergy(
    patient_id: UUID,
    payload: CreateAllergyRequest,
    context: OrganizationDep,
    connection: TenantConnection,
) -> AllergyResponse:
    context.require(Permission.PATIENT_WRITE)
    return await _repo.add_allergy(
        connection,
        patient_id=patient_id,
        organization_id=context.organization_id,
        created_by=context.user.id,
        payload=payload,
    )


@router.delete(
    "/{patient_id}/allergies/{allergy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove an allergy",
)
async def remove_allergy(
    patient_id: UUID,
    allergy_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> None:
    context.require(Permission.PATIENT_WRITE)
    removed = await _repo.remove_allergy(connection, allergy_id=allergy_id)
    if not removed:
        raise NotFoundError("Allergy not found")


# ===========================================================================
# Timeline
# ===========================================================================


@router.get(
    "/{patient_id}/timeline",
    response_model=list[TimelineEventResponse],
    summary="Patient timeline",
)
async def get_timeline(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[TimelineEventResponse]:
    _require_patient_access(context)
    return await _repo.list_timeline(connection, patient_id=patient_id)


@router.get(
    "/{patient_id}/consultations",
    response_model=list[ConsultationSummary],
    summary="List consultations for a patient",
)
async def list_patient_consultations(
    patient_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[ConsultationSummary]:
    _require_patient_access(context)
    return await _consultation_repo.list_for_patient(
        connection, patient_id=patient_id
    )
