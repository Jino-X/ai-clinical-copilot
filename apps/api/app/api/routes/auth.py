from fastapi import APIRouter, Request

from app.api.deps import AuditDep, CurrentUserDep, TenantConnection
from app.core.errors import NotFoundError
from app.core.permissions import permissions_for
from app.repositories.organizations import OrganizationRepository
from app.repositories.profiles import ProfileRepository
from app.schemas.auth import (
    CurrentUserResponse,
    UpdateProfileRequest,
    UserProfile,
)
from app.services.audit.service import AuditAction

router = APIRouter(prefix="/auth", tags=["auth"])

_profiles = ProfileRepository()
_organizations = OrganizationRepository()


@router.get("/me", response_model=CurrentUserResponse, summary="Current user")
async def me(user: CurrentUserDep, connection: TenantConnection) -> CurrentUserResponse:
    """Identity, memberships and effective permissions.

    The frontend uses this to decide what to render. It is a convenience, not
    a security boundary: every endpoint re-checks permissions server-side.
    """
    profile = await _profiles.get(connection, user.id)
    if profile is None:
        # The auth trigger creates a profile on signup, so this means the
        # trigger is missing or the migration was not applied.
        raise NotFoundError("User profile not found")

    memberships = await _organizations.list_memberships(connection, user.id)
    active = [m for m in memberships if m.status == "active"]

    # Mirrors the resolution order in get_organization_context.
    resolved = None
    if len(active) == 1:
        resolved = active[0]
    elif profile.active_organization_id is not None:
        resolved = next(
            (m for m in active if m.organization_id == profile.active_organization_id),
            None,
        )

    return CurrentUserResponse(
        profile=profile,
        memberships=memberships,
        active_organization_id=resolved.organization_id if resolved else None,
        permissions=sorted(permissions_for(resolved.role)) if resolved else [],
    )


@router.patch("/me", response_model=UserProfile, summary="Update own profile")
async def update_me(
    payload: UpdateProfileRequest,
    user: CurrentUserDep,
    connection: TenantConnection,
    audit: AuditDep,
    request: Request,
) -> UserProfile:
    # RLS restricts the UPDATE to the caller's own row, so there is no
    # user_id in the request body to be tampered with.
    profile = await _profiles.update(
        connection,
        user.id,
        full_name=payload.full_name,
        phone=payload.phone,
        avatar_url=payload.avatar_url,
    )
    if profile is None:
        raise NotFoundError("User profile not found")

    await audit.record(
        AuditAction.PROFILE_UPDATED,
        actor_user_id=user.id,
        resource_type="user_profile",
        resource_id=str(user.id),
        request=request,
        # Field names only. The values are personal data and do not belong in
        # an audit record (PRD §19).
        metadata={"fields": sorted(payload.model_dump(exclude_none=True).keys())},
    )
    return profile
