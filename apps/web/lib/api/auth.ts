import "server-only";

import type {
  CurrentUserResponse,
  MemberResponse,
  OrganizationResponse,
  OrganizationRole,
} from "@clinical-copilot/shared-types";

import { api } from "@/lib/api/client";
import { getAccessToken } from "@/lib/dal";

/**
 * Server-side API helpers for auth and organizations.
 *
 * Every call resolves the access token from the session via the DAL, so
 * tenant identifiers are never passed from the client. The backend derives
 * `organization_id` and the acting user from the bearer token.
 */

export async function getCurrentUserApi(): Promise<CurrentUserResponse> {
  const accessToken = await getAccessToken();
  return api.get<CurrentUserResponse>("/auth/me", { accessToken });
}

export async function updateProfileApi(input: {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}): Promise<void> {
  const accessToken = await getAccessToken();
  await api.patch("/auth/me", { accessToken, body: input });
}

export async function listMyOrganizationsApi(): Promise<
  { organization_id: string; organization_name: string; role: OrganizationRole; status: string }[]
> {
  const accessToken = await getAccessToken();
  return api.get("/organizations", { accessToken });
}

export async function createOrganizationApi(
  name: string,
): Promise<OrganizationResponse> {
  const accessToken = await getAccessToken();
  return api.post<OrganizationResponse>("/organizations", {
    accessToken,
    body: { name },
  });
}

export async function getOrganizationApi(
  organizationId: string,
): Promise<OrganizationResponse> {
  const accessToken = await getAccessToken();
  return api.get<OrganizationResponse>(
    `/organizations/${organizationId}`,
    { accessToken },
  );
}

export async function updateOrganizationApi(
  organizationId: string,
  name: string,
): Promise<OrganizationResponse> {
  const accessToken = await getAccessToken();
  return api.patch<OrganizationResponse>(
    `/organizations/${organizationId}`,
    { accessToken, body: { name } },
  );
}

export async function listMembersApi(
  organizationId: string,
): Promise<MemberResponse[]> {
  const accessToken = await getAccessToken();
  return api.get<MemberResponse[]>(
    `/organizations/${organizationId}/members`,
    { accessToken },
  );
}

export async function addMemberApi(
  organizationId: string,
  email: string,
  role: OrganizationRole,
): Promise<MemberResponse> {
  const accessToken = await getAccessToken();
  return api.post<MemberResponse>(
    `/organizations/${organizationId}/members`,
    { accessToken, body: { email, role } },
  );
}

export async function updateMemberRoleApi(
  organizationId: string,
  memberId: string,
  role: OrganizationRole,
): Promise<MemberResponse> {
  const accessToken = await getAccessToken();
  return api.patch<MemberResponse>(
    `/organizations/${organizationId}/members/${memberId}`,
    { accessToken, body: { role } },
  );
}

export async function removeMemberApi(
  organizationId: string,
  memberId: string,
): Promise<void> {
  const accessToken = await getAccessToken();
  await api.delete(`/organizations/${organizationId}/members/${memberId}`, {
    accessToken,
  });
}
