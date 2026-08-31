from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import asyncpg
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.permissions import (
    OrganizationRole,
    Permission,
    permissions_for,
)
from app.core.permissions import require as require_permission_for_role
from app.core.security import SupabaseTokenVerifier, TokenClaims
from app.db.pool import Database
from app.repositories.organizations import OrganizationRepository
from app.repositories.profiles import ProfileRepository
from app.services.audit.service import AuditService

# auto_error=False so a missing header produces our own error envelope rather
# than FastAPI's differently-shaped one.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_database(request: Request) -> Database:
    database: Database = request.app.state.database
    return database


def get_token_verifier(request: Request) -> SupabaseTokenVerifier:
    verifier: SupabaseTokenVerifier = request.app.state.token_verifier
    return verifier


def get_audit_service(request: Request) -> AuditService:
    service: AuditService = request.app.state.audit_service
    return service


SettingsDep = Annotated[Settings, Depends(get_settings)]
DatabaseDep = Annotated[Database, Depends(get_database)]
AuditDep = Annotated[AuditService, Depends(get_audit_service)]


@dataclass(frozen=True, slots=True)
class CurrentUser:
    """An authenticated principal. Identity only — no authorization."""

    id: UUID
    email: str | None
    claims: TokenClaims


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    verifier: Annotated[SupabaseTokenVerifier, Depends(get_token_verifier)],
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Missing bearer token")

    claims = await verifier.verify(credentials.credentials)
    return CurrentUser(id=claims.sub, email=claims.email, claims=claims)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


async def get_tenant_connection(
    user: CurrentUserDep, database: DatabaseDep
) -> AsyncIterator[asyncpg.Connection]:
    """A database connection with RLS in force for the authenticated user."""
    async with database.tenant(user.id) as connection:
        yield connection


TenantConnection = Annotated[asyncpg.Connection, Depends(get_tenant_connection)]


@dataclass(frozen=True, slots=True)
class OrganizationContext:
    """The organization a request acts in, and the caller's role in it.

    Constructing this is the authorization step: it only exists if the caller
    holds an active membership, so `organization_id` here is always verified —
    never a value copied from the request.
    """

    organization_id: UUID
    role: OrganizationRole
    user: CurrentUser

    @property
    def permissions(self) -> frozenset[Permission]:
        return permissions_for(self.role)

    def require(self, permission: Permission) -> None:
        require_permission_for_role(self.role, permission)


async def get_organization_context(
    user: CurrentUserDep,
    connection: TenantConnection,
    # A client may *request* an organization, but the value is only ever used
    # to look up a membership. It confers nothing on its own (PRD §18).
    requested_organization_id: Annotated[
        UUID | None, Header(alias="X-Organization-Id")
    ] = None,
) -> OrganizationContext:
    repository = OrganizationRepository()

    if requested_organization_id is not None:
        role = await repository.get_membership_role(
            connection,
            organization_id=requested_organization_id,
            user_id=user.id,
        )
        if role is None:
            # Deliberately "not a member" rather than "no such organization":
            # confirming existence would leak that a tenant id is real.
            raise PermissionDeniedError(
                "You are not an active member of that organization"
            )
        return OrganizationContext(
            organization_id=requested_organization_id, role=role, user=user
        )

    memberships = [
        membership
        for membership in await repository.list_memberships(connection, user.id)
        if membership.status == "active"
    ]

    if not memberships:
        raise PermissionDeniedError("You do not belong to an organization yet")

    if len(memberships) == 1:
        membership = memberships[0]
        return OrganizationContext(
            organization_id=membership.organization_id,
            role=membership.role,
            user=user,
        )

    # Several memberships: fall back to the remembered preference, which is
    # still re-checked against the membership list rather than trusted.
    profile = await ProfileRepository().get(connection, user.id)
    preferred = profile.active_organization_id if profile else None
    for membership in memberships:
        if membership.organization_id == preferred:
            return OrganizationContext(
                organization_id=membership.organization_id,
                role=membership.role,
                user=user,
            )

    # Ambiguity is an error, not a guess. Silently picking one could route a
    # clinician's work into the wrong tenant.
    raise PermissionDeniedError(
        "You belong to multiple organizations; specify X-Organization-Id"
    )


OrganizationDep = Annotated[OrganizationContext, Depends(get_organization_context)]


def requires(
    permission: Permission,
) -> Callable[[OrganizationContext], OrganizationContext]:
    """Route dependency asserting the caller holds a permission.

    @router.get("/members", dependencies=[Depends(requires(Permission.MEMBER_READ))])
    """

    def dependency(context: OrganizationDep) -> OrganizationContext:
        context.require(permission)
        return context

    return dependency
