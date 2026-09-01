"use client";

import type {
  CurrentUserResponse,
  OrganizationResponse,
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
