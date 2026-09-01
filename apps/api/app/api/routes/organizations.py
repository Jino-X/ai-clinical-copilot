from uuid import UUID

from fastapi import APIRouter, Request, status

from app.api.deps import (
    AuditDep,
    CurrentUserDep,
    OrganizationDep,
    TenantConnection,
)
from app.core.errors import NotFoundError
from app.core.permissions import Permission
from app.repositories.organizations import OrganizationRepository
from app.repositories.profiles import ProfileRepository
from app.schemas.auth import (
    CreateOrganizationRequest,
    MembershipSummary,
    OrganizationResponse,
    UpdateOrganizationRequest,
)
from app.services.audit.service import AuditAction

router = APIRouter(prefix="/organizations", tags=["organizations"])

_organizations = OrganizationRepository()
_profiles = ProfileRepository()


@router.get("", response_model=list[MembershipSummary], summary="My organizations")
async def list_my_organizations(
    user: CurrentUserDep, connection: TenantConnection
) -> list[MembershipSummary]:
    return await _organizations.list_memberships(connection, user.id)


@router.post(
    "",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an organization",
)
async def create_organization(
    payload: CreateOrganizationRequest,
    user: CurrentUserDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> OrganizationResponse:
    """Any authenticated user may create an organization and becomes a member."""
    organization = await _organizations.create(
        connection, name=payload.name, created_by=user.id
    )

    # Make it the active organization so the next request resolves without
    # needing an explicit header.
    await _profiles.set_active_organization(connection, user.id, organization.id)

    await audit.record(
        AuditAction.ORGANIZATION_CREATED,
        actor_user_id=user.id,
        organization_id=organization.id,
        resource_type="organization",
        resource_id=str(organization.id),
        request=request,
    )
    return organization


@router.get(
    "/{organization_id}",
    response_model=OrganizationResponse,
    summary="Get an organization",
)
async def get_organization(
    organization_id: UUID, connection: TenantConnection
) -> OrganizationResponse:
    organization = await _organizations.get(connection, organization_id)
    if organization is None:
        # 404 rather than 403 for a non-member: distinguishing the two would
        # confirm that an organization id exists.
        raise NotFoundError("Organization not found")
    return organization


@router.patch(
    "/{organization_id}",
    response_model=OrganizationResponse,
    summary="Rename an organization",
)
async def update_organization(
    organization_id: UUID,
    payload: UpdateOrganizationRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> OrganizationResponse:
    context.require(Permission.ORGANIZATION_UPDATE)

    organization = await _organizations.update_name(
        connection, organization_id, payload.name
    )
    if organization is None:
        raise NotFoundError("Organization not found")

    await audit.record(
        AuditAction.ORGANIZATION_UPDATED,
        actor_user_id=context.user.id,
        organization_id=organization_id,
        resource_type="organization",
        resource_id=str(organization_id),
        request=request,
    )
    return organization
