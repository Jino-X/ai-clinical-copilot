import Link from "next/link";
import { Stethoscope } from "lucide-react";

import { getCurrentUser } from "@/lib/dal";
import { getCurrentUserApi } from "@/lib/api/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Protected dashboard layout.
 *
 * `getCurrentUser` is the server-side gate — it redirects to /login if
 * there is no verified session. The proxy already does this optimistically,
 * but this is the actual check.
 *
 * The layout fetches the current user's profile and memberships so every
 * dashboard page has the context without re-fetching.
 */
export default async function DashboardLayout({
  children,
}: LayoutProps<"/">) {
  const user = await getCurrentUser();

  // Fetch the backend's view of the user. If the backend is unreachable
  // or the profile doesn't exist yet (e.g. the auth trigger hasn't run),
  // we still render the shell — the onboarding page handles the "no
  // organization" case.
  let profile: { full_name: string | null; email: string } | null = null;
  let hasOrganizations = false;

  try {
    const me = await getCurrentUserApi();
    profile = { full_name: me.profile.full_name, email: me.profile.email };
    hasOrganizations = me.memberships.some((m) => m.status === "active");
  } catch {
    // Backend may be down during development. The shell still renders so
    // the user can see something rather than a blank page.
  }

  const displayName = profile?.full_name || profile?.email || user.email;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <Stethoscope className="size-4" aria-hidden />
            Clinical Copilot
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{displayName}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex flex-1">
        {hasOrganizations && (
          <nav className="hidden w-56 border-r p-4 md:block">
            <ul className="space-y-1 text-sm">
              <li>
                <Link
                  href="/dashboard"
                  className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Overview
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/patients"
                  className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Patients
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/consultations"
                  className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Consultations
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/organization"
                  className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Organization
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/members"
                  className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Members
                </Link>
              </li>
            </ul>
          </nav>
        )}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
