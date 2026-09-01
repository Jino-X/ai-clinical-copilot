import Link from "next/link";
import { Building2, Users, FileText, AlertCircle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUserApi } from "@/lib/api/auth";

export default async function DashboardPage() {
  let me = null;
  try {
    me = await getCurrentUserApi();
  } catch {
    // Backend unreachable — render a degraded state.
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="size-5 text-amber-600" aria-hidden />
            <p className="text-sm text-muted-foreground">
              The backend API is unavailable. Some features may not work
              correctly. Please try again in a moment.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeMemberships = me.memberships.filter(
    (m) => m.status === "active",
  );

  if (activeMemberships.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Clinical Copilot
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Create your organization</CardTitle>
            <CardDescription>
              You need an organization before you can start managing
              patients and consultations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/onboarding">
                <Building2 className="size-4" aria-hidden />
                Create organization
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeOrg = activeMemberships.find(
    (m) => m.organization_id === me.active_organization_id,
  ) ?? activeMemberships[0];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {activeOrg.organization_name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Building2 className="size-4" aria-hidden />
              Organization
            </CardTitle>
            <CardDescription>{activeOrg.organization_name}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/organization"
              className="text-sm text-primary hover:underline"
            >
              View details →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="size-4" aria-hidden />
              Patients
            </CardTitle>
            <CardDescription>Manage your patients</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/patients"
              className="text-sm text-primary hover:underline"
            >
              View patients →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="size-4" aria-hidden />
              Consultations
            </CardTitle>
            <CardDescription>Active and past consultations</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/consultations"
              className="text-sm text-primary hover:underline"
            >
              View consultations →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
