from enum import StrEnum

from app.core.errors import PermissionDeniedError


class OrganizationRole(StrEnum):
    """Mirrors the `public.organization_role` enum in the database."""

    STAFF = "staff"
    NURSE = "nurse"
    DOCTOR = "doctor"
    ADMIN = "admin"
    OWNER = "owner"


class Permission(StrEnum):
    """Capabilities, named for what they allow rather than for a role.

    Checking a permission rather than a role means a role change is a one-line
    edit to the table below instead of a search for `== "admin"` across the
    codebase.
    """

    # Organization administration
    ORGANIZATION_UPDATE = "organization:update"
    ORGANIZATION_DELETE = "organization:delete"
    MEMBER_READ = "member:read"
    MEMBER_INVITE = "member:invite"
    MEMBER_UPDATE_ROLE = "member:update_role"
    MEMBER_REMOVE = "member:remove"
    AUDIT_READ = "audit:read"

    # Clinical. Declared now so later phases have a single place to hang
    # authorization off, and so the boundary is visible from the start.
    PATIENT_READ = "patient:read"
    PATIENT_WRITE = "patient:write"
    CONSULTATION_CONDUCT = "consultation:conduct"
    # Only a clinician may turn an AI draft into an official record (PRD §5).
    CLINICAL_NOTE_APPROVE = "clinical_note:approve"


_ADMIN_PERMISSIONS = frozenset(
    {
        Permission.ORGANIZATION_UPDATE,
        Permission.MEMBER_READ,
        Permission.MEMBER_INVITE,
        Permission.MEMBER_UPDATE_ROLE,
        Permission.MEMBER_REMOVE,
        Permission.AUDIT_READ,
    }
)

_CLINICAL_PERMISSIONS = frozenset(
    {
        Permission.PATIENT_READ,
        Permission.PATIENT_WRITE,
        Permission.CONSULTATION_CONDUCT,
    }
)

ROLE_PERMISSIONS: dict[OrganizationRole, frozenset[Permission]] = {
    # Administrative staff schedule and register patients. They deliberately
    # get no clinical read access.
    OrganizationRole.STAFF: frozenset(
        {
            Permission.PATIENT_READ,
            Permission.PATIENT_WRITE,
            Permission.MEMBER_READ,
        }
    ),
    OrganizationRole.NURSE: _CLINICAL_PERMISSIONS | {Permission.MEMBER_READ},
    # CLINICAL_NOTE_APPROVE stops here and does not extend to admins: approving
    # a clinical record is a clinical act, not an administrative one.
    OrganizationRole.DOCTOR: _CLINICAL_PERMISSIONS
    | {Permission.MEMBER_READ, Permission.CLINICAL_NOTE_APPROVE},
    OrganizationRole.ADMIN: _ADMIN_PERMISSIONS,
    OrganizationRole.OWNER: _ADMIN_PERMISSIONS | {Permission.ORGANIZATION_DELETE},
}


def permissions_for(role: OrganizationRole) -> frozenset[Permission]:
    return ROLE_PERMISSIONS.get(role, frozenset())


def has_permission(role: OrganizationRole, permission: Permission) -> bool:
    return permission in permissions_for(role)


def require(role: OrganizationRole, permission: Permission) -> None:
    if not has_permission(role, permission):
        # The message names the permission, not the caller's role: it is
        # actionable without disclosing the organization's role assignments.
        raise PermissionDeniedError(
            f"This action requires the '{permission.value}' permission"
        )
