from uuid import UUID

from fastapi import APIRouter, Request, status

from app.api.deps import (
    AuditDep,
    CurrentUserDep,
    DatabaseDep,
    OrganizationDep,
    TenantConnection,
)
from app.core.errors import ConflictError, NotFoundError
from app.core.permissions import OrganizationRole, Permission
from app.repositories.organizations import OrganizationRepository
from app.repositories.profiles import ProfileRepository
from app.schemas.auth import (
    AddMemberRequest,
    CreateOrganizationRequest,
    MemberResponse,
    MembershipSummary,
    OrganizationResponse,
    UpdateMemberRoleRequest,
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
    """Any authenticated user may create an organization and becomes its owner.

    This is the onboarding path: a new clinician has no organization, so this
    endpoint cannot itself require one.
    """
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
    _assert_path_matches_context(organization_id, context)
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


@router.get(
    "/{organization_id}/members",
    response_model=list[MemberResponse],
    summary="List members",
)
async def list_members(
    organization_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
) -> list[MemberResponse]:
    _assert_path_matches_context(organization_id, context)
    context.require(Permission.MEMBER_READ)
    return await _organizations.list_members(connection, organization_id)


@router.post(
    "/{organization_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a member",
)
async def add_member(
    organization_id: UUID,
    payload: AddMemberRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    database: DatabaseDep,
    audit: AuditDep,
    request: Request,
) -> MemberResponse:
    _assert_path_matches_context(organization_id, context)
    context.require(Permission.MEMBER_INVITE)

    # Only an owner may create another owner; an admin promoting someone to
    # owner would be an escalation past their own level.
    if payload.role is OrganizationRole.OWNER:
        context.require(Permission.ORGANIZATION_DELETE)

    # Resolving an email to a user needs to see accounts the caller does not
    # share an organization with, which RLS correctly hides. Permission to
    # invite has already been established above, and only membership — never
    # the looked-up profile — is returned.
    async with database.privileged() as privileged:
        user_id = await _profiles.find_user_id_by_email(privileged, payload.email)

    if user_id is None:
        # Sending an email invitation to a non-existent account is Supabase
        # Auth's job (admin invite API) and is not wired up yet.
        raise NotFoundError(
            "No account exists for that email address. "
            "Ask them to sign up first, then add them."
        )

    member = await _organizations.add_member(
        connection,
        organization_id=organization_id,
        user_id=user_id,
        role=payload.role,
        invited_by=context.user.id,
    )
    if member is None:
        raise ConflictError("That user is already a member of this organization")

    await audit.record(
        AuditAction.MEMBER_INVITED,
        actor_user_id=context.user.id,
        organization_id=organization_id,
        resource_type="organization_member",
        resource_id=str(member.id),
        request=request,
        metadata={"role": payload.role.value},
    )
    return member


@router.patch(
    "/{organization_id}/members/{member_id}",
    response_model=MemberResponse,
    summary="Change a member's role",
)
async def update_member_role(
    organization_id: UUID,
    member_id: UUID,
    payload: UpdateMemberRoleRequest,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> MemberResponse:
    _assert_path_matches_context(organization_id, context)
    context.require(Permission.MEMBER_UPDATE_ROLE)

    if payload.role is OrganizationRole.OWNER:
        context.require(Permission.ORGANIZATION_DELETE)

    member = await _organizations.update_member_role(
        connection,
        organization_id=organization_id,
        member_id=member_id,
        role=payload.role,
    )
    if member is None:
        raise NotFoundError("Member not found")

    await audit.record(
        AuditAction.MEMBER_ROLE_CHANGED,
        actor_user_id=context.user.id,
        organization_id=organization_id,
        resource_type="organization_member",
        resource_id=str(member_id),
        request=request,
        metadata={"role": payload.role.value},
    )
    return member


@router.delete(
    "/{organization_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member",
)
async def remove_member(
    organization_id: UUID,
    member_id: UUID,
    context: OrganizationDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> None:
    _assert_path_matches_context(organization_id, context)
    context.require(Permission.MEMBER_REMOVE)

    removed = await _organizations.remove_member(
        connection, organization_id=organization_id, member_id=member_id
    )
    if not removed:
        raise NotFoundError("Member not found")

    await audit.record(
        AuditAction.MEMBER_REMOVED,
        actor_user_id=context.user.id,
        organization_id=organization_id,
        resource_type="organization_member",
        resource_id=str(member_id),
        request=request,
    )


def _assert_path_matches_context(organization_id: UUID, context: OrganizationDep) -> None:
    """Guard against acting on one organization while authorized for another.

    The context is resolved from membership (optionally steered by the
    X-Organization-Id header), while the path carries its own id. If they
    disagree, the caller's role was established somewhere other than the
    organization they are trying to modify.
    """
    if organization_id != context.organization_id:
        raise NotFoundError("Organization not found")
