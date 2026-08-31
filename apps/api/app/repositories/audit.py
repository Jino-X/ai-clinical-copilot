from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import asyncpg


class AuditRepository:
    """Appends to `public.audit_logs`.

    Insert-only by design. There is no update or delete method here, and no
    policy or grant that would allow one — an audit trail that can be edited
    is not evidence of anything.
    """

    async def append(
        self,
        connection: asyncpg.Connection,
        *,
        action: str,
        organization_id: UUID | None = None,
        actor_user_id: UUID | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        await connection.execute(
            """
            insert into public.audit_logs
                   (organization_id, actor_user_id, action, resource_type,
                    resource_id, ip_address, user_agent, metadata)
            values ($1, $2, $3, $4, $5, $6::inet, $7, $8::jsonb)
            """,
            organization_id,
            actor_user_id,
            action,
            resource_type,
            resource_id,
            ip_address,
            user_agent,
            json.dumps(metadata or {}),
        )
