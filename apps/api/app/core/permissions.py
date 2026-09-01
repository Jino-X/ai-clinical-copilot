from enum import StrEnum

from app.core.errors import PermissionDeniedError


class Permission(StrEnum):
    """Capabilities the doctor has in the system.

    This is a doctor-only tool: every authenticated member of an organization
    is a doctor with full clinical access. There are no admin, nurse, or staff
    roles. The permission check still exists so the boundary is explicit and
    future phases can add finer-grained checks without a sweeping refactor.
    """

    PATIENT_READ = "patient:read"
    PATIENT_WRITE = "patient:write"
    CONSULTATION_CONDUCT = "consultation:conduct"
    CLINICAL_NOTE_APPROVE = "clinical_note:approve"
    ORGANIZATION_UPDATE = "organization:update"


_DOCTOR_PERMISSIONS = frozenset(
    {
        Permission.PATIENT_READ,
        Permission.PATIENT_WRITE,
        Permission.CONSULTATION_CONDUCT,
        Permission.CLINICAL_NOTE_APPROVE,
        Permission.ORGANIZATION_UPDATE,
    }
)


def permissions_for() -> frozenset[Permission]:
    """All doctors have the same permissions."""
    return _DOCTOR_PERMISSIONS


def has_permission(permission: Permission) -> bool:
    return permission in _DOCTOR_PERMISSIONS


def require(permission: Permission) -> None:
    if not has_permission(permission):
        raise PermissionDeniedError(
            f"This action requires the '{permission.value}' permission"
        )
