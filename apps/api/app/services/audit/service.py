from __future__ import annotations

from enum import StrEnum
from typing import Any
from uuid import UUID

from fastapi import Request

from app.core.logging import get_logger
from app.db.pool import Database
from app.repositories.audit import AuditRepository

logger = get_logger(__name__)


class AuditAction(StrEnum):
    """The actions worth recording (PRD §19).

    Clinical actions are declared here now so later phases record them with
    the same vocabulary rather than inventing strings.
    """

    LOGIN = "LOGIN"
    ORGANIZATION_CREATED = "ORGANIZATION_CREATED"
    ORGANIZATION_UPDATED = "ORGANIZATION_UPDATED"
    MEMBER_INVITED = "MEMBER_INVITED"
    MEMBER_ROLE_CHANGED = "MEMBER_ROLE_CHANGED"
    MEMBER_REMOVED = "MEMBER_REMOVED"
    PROFILE_UPDATED = "PROFILE_UPDATED"

    PATIENT_VIEWED = "PATIENT_VIEWED"
    PATIENT_CREATED = "PATIENT_CREATED"
    PATIENT_UPDATED = "PATIENT_UPDATED"
    PATIENT_DELETED = "PATIENT_DELETED"
    CONSULTATION_STARTED = "CONSULTATION_STARTED"
    CONSULTATION_COMPLETED = "CONSULTATION_COMPLETED"
    TRANSCRIPT_GENERATED = "TRANSCRIPT_GENERATED"
    AI_NOTE_GENERATED = "AI_NOTE_GENERATED"
    CLINICAL_NOTE_EDITED = "CLINICAL_NOTE_EDITED"
    CLINICAL_NOTE_APPROVED = "CLINICAL_NOTE_APPROVED"
    DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED"
    DOCUMENT_VIEWED = "DOCUMENT_VIEWED"
    PATIENT_DATA_EXPORTED = "PATIENT_DATA_EXPORTED"


class AuditService:
    def __init__(self, database: Database) -> None:
        self._database = database
        self._repository = AuditRepository()

    async def record(
        self,
        action: AuditAction,
        *,
        actor_user_id: UUID | None = None,
        organization_id: UUID | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        request: Request | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Append an audit entry.

        Uses a privileged connection deliberately: `authenticated` has no
        INSERT grant on audit_logs, so a user cannot forge or suppress entries.

        Failure to write an audit entry is logged but never propagated. An
        audit outage must not, for example, prevent a doctor from saving a
        consultation — losing clinical work is the worse failure. The log line
        is the fallback record.
        """
        ip_address, user_agent = _client_context(request)

        try:
            async with self._database.privileged() as connection:
                await self._repository.append(
                    connection,
                    action=action.value,
                    organization_id=organization_id,
                    actor_user_id=actor_user_id,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    metadata=metadata,
                )
        except Exception as exc:
            logger.error(
                "audit_write_failed",
                action=action.value,
                actor_user_id=str(actor_user_id) if actor_user_id else None,
                organization_id=str(organization_id) if organization_id else None,
                error_type=type(exc).__name__,
            )


def _client_context(request: Request | None) -> tuple[str | None, str | None]:
    if request is None:
        return None, None

    # Behind an ALB the peer address is the load balancer, so prefer the
    # left-most X-Forwarded-For entry. Trustworthy only because the ALB
    # rewrites this header; do not trust it when directly internet-facing.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip_address: str | None = forwarded.split(",")[0].strip()
    elif request.client is not None:
        ip_address = request.client.host
    else:
        ip_address = None

    user_agent = request.headers.get("user-agent")
    if user_agent is not None:
        user_agent = user_agent[:500]

    return ip_address, user_agent
