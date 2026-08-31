from __future__ import annotations

from uuid import UUID

import asyncpg

from app.core.permissions import OrganizationRole
from app.schemas.auth import MembershipSummary, MemberResponse, OrganizationResponse


class OrganizationRepository:
    async def create(
        self, connection: asyncpg.Connection, *, name: str, created_by: UUID
    ) -> OrganizationResponse:
        # A database trigger makes the creator an owner in the same statement,
        # so there is no window where the row exists without a member and is
        # therefore invisible to its own creator.
        row = await connection.fetchrow(
            """
            insert into public.organizations (name, created_by)
            values ($1, $2)
            returning id, name, created_at
            """,
            name.strip(),
            created_by,
        )
        return OrganizationResponse.model_validate(
            dict(row) | {"role": OrganizationRole.OWNER}
        )

    async def get(
        self, connection: asyncpg.Connection, organization_id: UUID
    ) -> OrganizationResponse | None:
        row = await connection.fetchrow(
            """
            select o.id, o.name, o.created_at, m.role
              from public.organizations o
              join public.organization_members m
                on m.organization_id = o.id and m.user_id = auth.uid()
             where o.id = $1
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
                   m.role,
                   m.status::text as status
              from public.organization_members m
              join public.organizations o on o.id = m.organization_id
             where m.user_id = $1
             order by o.name
            """,
            user_id,
        )
        return [MembershipSummary.model_validate(dict(row)) for row in rows]

    async def get_membership_role(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        user_id: UUID,
    ) -> OrganizationRole | None:
        """The caller's active role in an organization, or None.

        This is the authorization decision for every tenant-scoped request:
        a `None` here means the caller is not a member, whatever they claimed.
        """
        row = await connection.fetchrow(
            """
            select role
              from public.organization_members
             where organization_id = $1
               and user_id = $2
               and status = 'active'
            """,
            organization_id,
            user_id,
        )
        return OrganizationRole(row["role"]) if row else None

    async def list_members(
        self, connection: asyncpg.Connection, organization_id: UUID
    ) -> list[MemberResponse]:
        rows = await connection.fetch(
            """
            select m.id,
                   m.user_id,
                   m.organization_id,
                   p.email,
                   p.full_name,
                   m.role,
                   m.status::text as status,
                   m.created_at
              from public.organization_members m
              join public.user_profiles p on p.id = m.user_id
             where m.organization_id = $1
             order by p.email
            """,
            organization_id,
        )
        return [MemberResponse.model_validate(dict(row)) for row in rows]

    async def add_member(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        user_id: UUID,
        role: OrganizationRole,
        invited_by: UUID,
    ) -> MemberResponse | None:
        row = await connection.fetchrow(
            """
            insert into public.organization_members
                   (organization_id, user_id, role, invited_by, status)
            values ($1, $2, $3, $4, 'active')
            on conflict (organization_id, user_id) do nothing
            returning id, user_id, organization_id, role,
                      status::text as status, created_at
            """,
            organization_id,
            user_id,
            role.value,
            invited_by,
        )
        if row is None:
            return None

        profile = await connection.fetchrow(
            "select email, full_name from public.user_profiles where id = $1",
            user_id,
        )
        return MemberResponse.model_validate(dict(row) | dict(profile or {}))

    async def update_member_role(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        member_id: UUID,
        role: OrganizationRole,
    ) -> MemberResponse | None:
        row = await connection.fetchrow(
            """
            update public.organization_members m
               set role = $3
              from public.user_profiles p
             where m.id = $2
               and m.organization_id = $1
               and p.id = m.user_id
            returning m.id, m.user_id, m.organization_id, p.email, p.full_name,
                      m.role, m.status::text as status, m.created_at
            """,
            organization_id,
            member_id,
            role.value,
        )
        return MemberResponse.model_validate(dict(row)) if row else None

    async def remove_member(
        self,
        connection: asyncpg.Connection,
        *,
        organization_id: UUID,
        member_id: UUID,
    ) -> bool:
        # organization_id is in the predicate as well as member_id so a member
        # id from another tenant cannot be deleted even if RLS were misapplied.
        result = await connection.execute(
            """
            delete from public.organization_members
             where id = $2 and organization_id = $1
            """,
            organization_id,
            member_id,
        )
        return result.endswith("1")
