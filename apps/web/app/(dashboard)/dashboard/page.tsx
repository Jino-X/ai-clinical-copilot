import Link from "next/link";
import {
  Building2,
  Users,
  FileText,
  AlertCircle,
  Stethoscope,
  Activity,
  ArrowRight,
  Sparkles,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  StatCard,
  EmptyState,
  AnimatedSection,
} from "@/components/clinical";
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
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Your clinical workspace overview"
          icon={Activity}
        />
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-6">
            <div className="flex size-10 items-center justify-center rounded-xl bg-warning/15">
              <AlertCircle className="size-5 text-warning" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium">Backend API unavailable</p>
              <p className="text-xs text-muted-foreground">
                Some features may not work correctly. Please try again in a moment.
              </p>
            </div>
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
      <div className="space-y-6">
        <PageHeader
          title="Welcome to Clinical Copilot"
          description="AI-powered clinical documentation assistant"
          icon={Sparkles}
        />
        <EmptyState
          icon={Building2}
          title="Create your organization"
          description="You need an organization before you can start managing patients and consultations."
          action={
            <Button asChild>
              <Link href="/dashboard/onboarding">
                <Building2 className="size-4" aria-hidden />
                Create organization
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const activeOrg = activeMemberships.find(
    (m) => m.organization_id === me.active_organization_id,
  ) ?? activeMemberships[0];

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <AnimatedSection animation="fade-in-down">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 lg:p-8">
          <div className="absolute right-0 top-0 -mr-8 -mt-8 size-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15">
                <Stethoscope className="size-4 text-primary" aria-hidden />
              </div>
              <span className="text-sm font-medium text-primary">
                {activeOrg.organization_name}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Good to see you, Doctor
            </h1>
            <p className="text-sm text-muted-foreground max-w-lg">
              Your AI copilot is ready. Record consultations, generate SOAP notes,
              and search patient records — all with doctor-approved clinical safety.
            </p>
          </div>
        </div>
      </AnimatedSection>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Organization"
          value={activeOrg.organization_name}
          icon={Building2}
          href="/dashboard/organization"
          accent="primary"
        />
        <StatCard
          label="Patients"
          value="Manage"
          icon={Users}
          href="/dashboard/patients"
          accent="info"
          trend="Search and manage patient records"
        />
        <StatCard
          label="Consultations"
          value="View"
          icon={FileText}
          href="/dashboard/consultations"
          accent="success"
          trend="Active and past consultations"
        />
      </div>

      {/* Quick actions */}
      <AnimatedSection delay={200}>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="card-hover group cursor-pointer border-border/60 transition-smooth">
            <Link href="/dashboard/patients" className="block">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-info/10 text-info transition-smooth group-hover:scale-110">
                    <Users className="size-4" aria-hidden />
                  </div>
                  Manage Patients
                </CardTitle>
                <CardDescription>
                  Search, create, and view patient records with medical history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="flex items-center gap-1 text-sm font-medium text-primary transition-smooth group-hover:gap-2">
                  Go to patients
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </CardContent>
            </Link>
          </Card>

          <Card className="card-hover group cursor-pointer border-border/60 transition-smooth">
            <Link href="/dashboard/consultations" className="block">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-success/10 text-success transition-smooth group-hover:scale-110">
                    <Stethoscope className="size-4" aria-hidden />
                  </div>
                  Consultations
                </CardTitle>
                <CardDescription>
                  View active and past consultations with AI documentation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="flex items-center gap-1 text-sm font-medium text-primary transition-smooth group-hover:gap-2">
                  Go to consultations
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </CardContent>
            </Link>
          </Card>
        </div>
      </AnimatedSection>

      {/* Safety notice */}
      <AnimatedSection delay={300}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="size-4 text-primary" aria-hidden />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">AI prepares. Doctor decides.</p>
              <p className="text-xs text-muted-foreground">
                Every AI-generated clinical note is a draft until you review and approve it.
                Original audio and transcripts are never modified.
              </p>
            </div>
          </CardContent>
        </Card>
      </AnimatedSection>
    </div>
  );
}
