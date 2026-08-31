from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.permissions import OrganizationRole, Permission


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    active_organization_id: UUID | None = None


class MembershipSummary(BaseModel):
    """One organization the caller belongs to."""

    organization_id: UUID
    organization_name: str
    role: OrganizationRole
    status: str


class CurrentUserResponse(BaseModel):
    profile: UserProfile
    memberships: list[MembershipSummary]
    # The organization this request acted in, and what the caller may do in it.
    # Resolved server-side from membership, never from the request body.
    active_organization_id: UUID | None = None
    permissions: list[Permission] = Field(default_factory=list)


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    avatar_url: str | None = Field(default=None, max_length=2000)


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime
    # The caller's own role in this organization.
    role: OrganizationRole | None = None


class CreateOrganizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=200)


class UpdateOrganizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=200)


class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    organization_id: UUID
    email: EmailStr
    full_name: str | None = None
    role: OrganizationRole
    status: str
    created_at: datetime


class AddMemberRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    role: OrganizationRole = OrganizationRole.DOCTOR


class UpdateMemberRoleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: OrganizationRole
