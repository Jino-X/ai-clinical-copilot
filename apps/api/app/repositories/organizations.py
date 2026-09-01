from __future__ import annotations

from uuid import UUID

import asyncpg

from app.schemas.auth import MembershipSummary, OrganizationResponse


class OrganizationRepository:
    async def create(
        self, connection: asyncpg.Connection, *, name: str, created_by: UUID
    ) -> OrganizationResponse:
        # A database trigger makes the creator a member in the same statement,
        # so there is no window where the row exists without a member and is
        # therefore invisible to its own creator.
        #
        # We cannot use INSERT ... RETURNING here: PostgreSQL evaluates the
        # SELECT RLS policy on the RETURNING clause *before* the AFTER INSERT
        # trigger creates the membership, so the creator would be denied their
        # own row. Instead, insert without RETURNING, then SELECT the row back
        # (the trigger has now made the creator a member, so the SELECT policy
        # passes).
        await connection.execute(
            """
            insert into public.organizations (name, created_by)
            values ($1, $2)
            """,
            name.strip(),
            created_by,
        )
        row = await connection.fetchrow(
            """
            select o.id, o.name, o.created_at
              from public.organizations o
              join public.organization_members m
                on m.organization_id = o.id and m.user_id = auth.uid()
             where o.created_by = $1
             order by o.created_at desc
             limit 1
            """,
            created_by,
        )
        return OrganizationResponse.model_validate(dict(row))

    async def get(
        self, connection: asyncpg.Connection, organization_id: UUID
    ) -> OrganizationResponse | None:
        row = await connection.fetchrow(
            """
            select id, name, created_at
              from public.organizations
             where id = $1
            """,
            organization_id,
        )
        return OrganizationResponse.model_validate(dict(row)) if row else None

    async def update_name(
        self, connection: asyncpg.Connection, organization_id: UUID, name: str
    ) -> OrganizationResponse | None:
        row = await connection.fetchrow(
            """
            update public.organizations
               set name = $2
             where id = $1
            returning id, name, created_at
            """,
            organization_id,
            name.strip(),
        )
        return OrganizationResponse.model_validate(dict(row)) if row else None

    async def list_memberships(
        self, connection: asyncpg.Connection, user_id: UUID
    ) -> list[MembershipSummary]:
        rows = await connection.fetch(
            """
            select m.organization_id,
                   o.name as organization_name,
                   m.status::text as status
              from public.organization_members m
              join public.organizations o on o.id = m.organization_id
             where m.user_id = $1
             order by o.name
            """,
            user_id,
        )
        return [MembershipSummary.model_validate(dict(row)) for row in rows]

    async def is_member(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Whether the caller is an active member of the organization."""
        row = await connection.fetchrow(
            """
            select 1
              from public.organization_members
             where organization_id = $1
               and user_id = $2
               and status = 'active'
            """,
            organization_id,
            user_id,
        )
        return row is not None
