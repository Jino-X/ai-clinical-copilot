import type { ApiErrorBody } from "@clinical-copilot/shared-types";

import { getPublicEnv } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body" | "method"> & {
  /** JSON-serialisable request body. */
  body?: unknown;
  /** Bearer token — a Supabase access token. Resolved by the caller. */
  accessToken?: string;
};

/**
 * Thin typed wrapper over the FastAPI backend.
 *
 * The backend derives `organization_id` and the acting user from the bearer
 * token, so tenant identifiers are deliberately not part of this signature.
 */
async function request<T>(
  method: string,
  path: string,
  { body, accessToken, headers, ...init }: RequestOptions = {},
): Promise<T> {
  const { NEXT_PUBLIC_API_URL } = getPublicEnv();

  const response = await fetch(`${NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as ApiErrorBody).error
        : null;
    throw new ApiError(
      response.status,
      error?.code ?? "http_error",
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, options),
  post: <T>(path: string, options?: RequestOptions) =>
    request<T>("POST", path, options),
  patch: <T>(path: string, options?: RequestOptions) =>
    request<T>("PATCH", path, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, options),
};
