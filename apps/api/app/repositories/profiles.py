from __future__ import annotations

from uuid import UUID

import asyncpg

from app.schemas.auth import UserProfile

_COLUMNS = """
  id, email, full_name, phone, avatar_url, active_organization_id
"""


class ProfileRepository:
    """Reads and writes `public.user_profiles`.

    Every method takes a connection rather than opening its own, so the caller
    decides whether the query runs under RLS. Routes pass a tenant connection.
    """

    async def get(
        self, connection: asyncpg.Connection, user_id: UUID
    ) -> UserProfile | None:
        row = await connection.fetchrow(
            f"select {_COLUMNS} from public.user_profiles where id = $1", user_id
        )
        return UserProfile.model_validate(dict(row)) if row else None

    async def update(
        self,
        connection: asyncpg.Connection,
        user_id: UUID,
        *,
        full_name: str | None,
        phone: str | None,
        avatar_url: str | None,
    ) -> UserProfile | None:
        # `coalesce` leaves an omitted field untouched, so a partial update
        # cannot silently blank out the other columns.
        row = await connection.fetchrow(
            f"""
            update public.user_profiles
               set full_name  = coalesce($2, full_name),
                   phone      = coalesce($3, phone),
                   avatar_url = coalesce($4, avatar_url)
             where id = $1
            returning {_COLUMNS}
            """,
            user_id,
            full_name,
            phone,
            avatar_url,
        )
        return UserProfile.model_validate(dict(row)) if row else None

    async def set_active_organization(
        self,
        connection: asyncpg.Connection,
        user_id: UUID,
        organization_id: UUID | None,
    ) -> None:
        await connection.execute(
            """
            update public.user_profiles
               set active_organization_id = $2
             where id = $1
            """,
            user_id,
            organization_id,
        )

    async def find_user_id_by_email(
        self, connection: asyncpg.Connection, email: str
    ) -> UUID | None:
        """Look up a user by email, for inviting an existing account.

        Runs on a privileged connection by necessity: RLS deliberately hides
        users the caller does not already share an organization with. The
        caller's permission to invite is checked before this is reached, and
        only a boolean-ish outcome is exposed — never the profile itself.
        """
        row = await connection.fetchrow(
            "select id from auth.users where lower(email) = lower($1)", email
        )
        return row["id"] if row else None
