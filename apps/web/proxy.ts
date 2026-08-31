import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

/**
 * Proxy (Next.js 16 replacement for middleware.ts).
 *
 * Two responsibilities:
 * 1. Refresh the Supabase session on every request so cookies stay current
 *    without a client-side round-trip. Server Components cannot write
 *    cookies, so this is the only place session refresh happens.
 * 2. Optimistically protect routes that require authentication. This is a
 *    UX redirect, not a security boundary — every protected page and API
 *    route re-checks the session server-side.
 *
 * @supabase/ssr recommends `supabase.auth.getClaims()` for verified
 * identity, but `getSession()` is sufficient here because the proxy is
 * only deciding whether to redirect; the actual authorization happens in
 * the DAL and the backend.
 */
export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            // Set on the incoming request so downstream Server Components
            // see the refreshed session, and on the outgoing response so
            // the browser stores it.
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not run for Next internals or static assets.
  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return response;
  }

  // Refresh the session. `getUser` (not `getSession`) makes a network call
  // to the Auth server to verify the token, which is the recommended way to
  // ensure the cookie is actually valid rather than just present.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isResetPage =
    pathname.startsWith("/reset") || pathname.startsWith("/verify");
  const isPublicPage = pathname === "/" || isAuthPage || isResetPage;

  if (!user && !isPublicPage) {
    // Redirect to login with a return path. The login page sends the user
    // back here after successful authentication.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    // Already signed in — don't show the login page again.
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static file extensions.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
