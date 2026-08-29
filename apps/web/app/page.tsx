import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { ApiStatus } from "@/components/system/api-status";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkPublicEnv } from "@/lib/env";

const PHASES = [
  { name: "Phase 1 — Foundation", done: true },
  { name: "Phase 2 — Authentication", done: false },
  { name: "Phase 3 — Patients", done: false },
  { name: "Phase 4 — Consultation", done: false },
  { name: "Phase 5 — AI documentation", done: false },
  { name: "Phase 6 — Patient intelligence", done: false },
  { name: "Phase 7 — Documents", done: false },
  { name: "Phase 8 — RAG", done: false },
  { name: "Phase 9 — Production", done: false },
];

export default function Home() {
  const env = checkPublicEnv();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          AI Clinical Copilot
        </h1>
        <p className="text-sm text-muted-foreground">
          Foundation scaffold. No patient data is stored or processed yet.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Frontend configuration</CardTitle>
          <CardDescription>
            Public environment variables, validated with Zod at runtime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {env.ok ? (
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              All required public variables are set.
            </p>
          ) : (
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 text-amber-600" aria-hidden />
              <div>
                <p className="font-medium">Missing or invalid variables</p>
                <ul className="mt-1 font-mono text-xs text-muted-foreground">
                  {env.missing.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
                <p className="mt-2 text-muted-foreground">
                  Copy <code>.env.example</code> to{" "}
                  <code>apps/web/.env.local</code>.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backend API</CardTitle>
          <CardDescription>
            Readiness probe from <code>apps/api</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {env.ok ? (
            <ApiStatus />
          ) : (
            <p className="text-sm text-muted-foreground">
              Configure the environment to enable this check.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Implementation phases</CardTitle>
          <CardDescription>Delivery order defined in PRD §26.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {PHASES.map((phase) => (
              <li key={phase.name} className="flex items-center gap-2">
                <span
                  className={
                    phase.done
                      ? "size-1.5 rounded-full bg-emerald-600"
                      : "size-1.5 rounded-full bg-muted-foreground/40"
                  }
                  aria-hidden
                />
                <span
                  className={phase.done ? "" : "text-muted-foreground"}
                >
                  {phase.name}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
