import Link from "next/link";
import {
  Stethoscope,
  Mic,
  FileText,
  Sparkles,
  CheckCircle,
  ArrowRight,
  Shield,
  Clock,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getOptionalUser } from "@/lib/dal";

export default async function Home() {
  const user = await getOptionalUser();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15">
              <Stethoscope className="size-5 text-primary" aria-hidden />
            </div>
            <span className="text-lg font-semibold">Clinical Copilot</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild>
                <Link href="/dashboard">
                  Go to Dashboard
                  <ArrowRight className="ml-1.5 size-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Create account</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
        <div className="text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10 animate-scale-in">
            <Stethoscope className="size-8 text-primary" aria-hidden />
          </div>
          <h1 className="mb-4 animate-fade-in-down text-4xl font-bold tracking-tight lg:text-5xl">
            AI-Powered Clinical Documentation
          </h1>
          <p className="mx-auto mb-8 max-w-2xl animate-fade-in-up text-lg text-muted-foreground delay-100">
            Reduce documentation time by 70%. Record consultations, generate SOAP notes,
            and search patient records — all with doctor-approved clinical safety.
          </p>
          <div className="flex animate-fade-in-up items-center justify-center gap-4 delay-200">
            {user ? (
              <Button asChild size="lg" className="gap-2">
                <Link href="/dashboard">
                  <Stethoscope className="size-4" aria-hidden />
                  Go to Dashboard
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="gap-2">
                  <Link href="/signup">
                    Get Started
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-y border-border/40 bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight">How It Works</h2>
            <p className="text-muted-foreground">
              Four simple steps from consultation to approved clinical note
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="group animate-fade-in-up opacity-0" style={{ animationDelay: "100ms" }}>
              <div className="relative mb-4 flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-smooth group-hover:scale-110 group-hover:bg-primary/15">
                <Mic className="size-6" aria-hidden />
                <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Record</h3>
              <p className="text-sm text-muted-foreground">
                Capture patient consultations with browser-based audio recording.
                Patient consent is recorded before each session.
              </p>
            </div>

            {/* Step 2 */}
            <div className="group animate-fade-in-up opacity-0" style={{ animationDelay: "200ms" }}>
              <div className="relative mb-4 flex size-14 items-center justify-center rounded-xl bg-info/10 text-info transition-smooth group-hover:scale-110 group-hover:bg-info/15">
                <Sparkles className="size-6" aria-hidden />
                <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-info text-xs font-bold text-info-foreground">
                  2
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">AI Processing</h3>
              <p className="text-sm text-muted-foreground">
                AI transcribes audio, extracts clinical information, and generates
                structured SOAP notes — always as a draft.
              </p>
            </div>

            {/* Step 3 */}
            <div className="group animate-fade-in-up opacity-0" style={{ animationDelay: "300ms" }}>
              <div className="relative mb-4 flex size-14 items-center justify-center rounded-xl bg-warning/10 text-warning transition-smooth group-hover:scale-110 group-hover:bg-warning/15">
                <FileText className="size-6" aria-hidden />
                <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-warning text-xs font-bold text-warning-foreground">
                  3
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Review & Edit</h3>
              <p className="text-sm text-muted-foreground">
                Doctors review AI-generated notes, make edits, and verify clinical
                accuracy before approval.
              </p>
            </div>

            {/* Step 4 */}
            <div className="group animate-fade-in-up opacity-0" style={{ animationDelay: "400ms" }}>
              <div className="relative mb-4 flex size-14 items-center justify-center rounded-xl bg-success/10 text-success transition-smooth group-hover:scale-110 group-hover:bg-success/15">
                <CheckCircle className="size-6" aria-hidden />
                <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-success text-xs font-bold text-success-foreground">
                  4
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Approve</h3>
              <p className="text-sm text-muted-foreground">
                Once approved, notes become official clinical records. Original audio
                and transcripts are preserved.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight">
              Built for Clinical Safety
            </h2>
            <p className="text-muted-foreground">
              Every feature designed with doctor-approved clinical standards
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1 */}
            <div className="card-hover animate-fade-in-up rounded-xl border border-border/60 bg-card p-6 opacity-0 transition-smooth" style={{ animationDelay: "100ms" }}>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Shield className="size-6" aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Clinical Safety First</h3>
              <p className="text-sm text-muted-foreground">
                AI output is always a draft. Doctors review and approve every clinical
                note. Never invents data.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="card-hover animate-fade-in-up rounded-xl border border-border/60 bg-card p-6 opacity-0 transition-smooth" style={{ animationDelay: "200ms" }}>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-success/10 text-success">
                <Clock className="size-6" aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Save 70% Time</h3>
              <p className="text-sm text-muted-foreground">
                Reduce documentation time from 20 minutes to 6 minutes per consultation.
                Focus on patient care.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="card-hover animate-fade-in-up rounded-xl border border-border/60 bg-card p-6 opacity-0 transition-smooth" style={{ animationDelay: "300ms" }}>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-info/10 text-info">
                <Sparkles className="size-6" aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-semibold">AI Intelligence</h3>
              <p className="text-sm text-muted-foreground">
                Visit comparison, patient summaries, and RAG-powered Q&A with source
                references.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="card-hover animate-fade-in-up rounded-xl border border-border/60 bg-card p-6 opacity-0 transition-smooth" style={{ animationDelay: "400ms" }}>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <FileText className="size-6" aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-semibold">SOAP Notes</h3>
              <p className="text-sm text-muted-foreground">
                Structured clinical documentation with versioning. Approved notes are
                append-only.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="card-hover animate-fade-in-up rounded-xl border border-border/60 bg-card p-6 opacity-0 transition-smooth" style={{ animationDelay: "500ms" }}>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-6" aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Multi-Tenant</h3>
              <p className="text-sm text-muted-foreground">
                Organization-based isolation with row-level security. Each clinic&apos;s data
                stays private.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="card-hover animate-fade-in-up rounded-xl border border-border/60 bg-card p-6 opacity-0 transition-smooth" style={{ animationDelay: "600ms" }}>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-success/10 text-success">
                <Mic className="size-6" aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Multilingual STT</h3>
              <p className="text-sm text-muted-foreground">
                Tamil and English speech-to-text with medical terminology preservation.
                Local AI processing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border/40 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/15 animate-scale-in">
            <Sparkles className="size-8 text-primary" aria-hidden />
          </div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight">
            Ready to Transform Your Clinical Workflow?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Join doctors who are saving hours on documentation every day.
          </p>
          <div className="flex items-center justify-center gap-4">
            {user ? (
              <Button asChild size="lg" className="gap-2">
                <Link href="/dashboard">
                  <Stethoscope className="size-4" aria-hidden />
                  Go to Dashboard
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="gap-2">
                  <Link href="/signup">
                    Get Started Free
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="size-4" aria-hidden />
              <span>AI prepares. Doctor decides.</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Clinical Copilot. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
