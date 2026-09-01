import "server-only";

import type {
  CurrentUserResponse,
  OrganizationResponse,
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
  { organization_id: string; organization_name: string; status: string }[]
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
