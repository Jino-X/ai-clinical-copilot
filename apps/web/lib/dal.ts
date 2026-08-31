import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer.
 *
 * Every Server Component or Server Action that needs the authenticated user
 * goes through here. This is the server-side security gate that complements
 * the optimistic redirect in `proxy.ts`: the proxy is UX, this is the
 * actual check.
 *
 * `getUser()` makes a network call to the Supabase Auth server to verify
 * the JWT. It is the recommended way to establish identity server-side —
 * `getSession()` reads from the cookie and is not cryptographically
 * verified.
 */

export type AuthenticatedUser = {
  id: string;
  email: string;
};

/**
 * Returns the authenticated user or redirects to /login.
 *
 * Use in Server Components that render protected pages. The redirect is
 * a safety net — `proxy.ts` should have already redirected unauthenticated
 * users, but a direct render or a race could bypass it.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return {
    id: user.id,
    email: user.email ?? "",
  };
}

/**
 * Returns the authenticated user's Supabase access token, or redirects
 * to /login. The token is passed to the FastAPI backend as a Bearer
 * credential; the backend verifies it independently.
 */
export async function getAccessToken(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    redirect("/login");
  }

  return session.access_token;
}

/**
 * Returns the user or null — for pages that work both authenticated and
 * unauthenticated (e.g. the landing page showing different content).
 */
export async function getOptionalUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? "",
  };
}
