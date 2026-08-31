"use client";

import type {
  CurrentUserResponse,
  MemberResponse,
  OrganizationResponse,
  OrganizationRole,
} from "@clinical-copilot/shared-types";

import { api } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side API helpers for auth and organizations.
 *
 * These get the Supabase access token from the browser client, which reads
 * it from the session cookie/cookie store. The backend verifies the token
 * independently — the token is never trusted client-side for authorization.
 */

async function getAccessToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return session.access_token;
}

export async function getCurrentUserApi(): Promise<CurrentUserResponse> {
  const accessToken = await getAccessToken();
  return api.get<CurrentUserResponse>("/auth/me", { accessToken });
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
