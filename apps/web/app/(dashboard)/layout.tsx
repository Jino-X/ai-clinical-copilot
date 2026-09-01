import { getCurrentUser } from "@/lib/dal";
import { getCurrentUserApi } from "@/lib/api/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

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
  // we still render the shell — the dashboard page handles the "no
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
    <div className="flex min-h-svh bg-background">
      {hasOrganizations && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header displayName={displayName} />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
