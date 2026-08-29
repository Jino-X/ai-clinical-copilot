"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { healthQuery } from "@/lib/api/health";

/**
 * Phase 1 wiring check: proves the browser can reach FastAPI through CORS and
 * that TanStack Query is mounted. Replaced by real dashboard content later.
 */
export function ApiStatus() {
  const { data, error, isPending } = useQuery({ ...healthQuery, retry: false });

  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Contacting API…
      </p>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 text-sm">
        <XCircle className="mt-0.5 size-4 text-destructive" aria-hidden />
        <div>
          <p className="font-medium text-destructive">API unreachable</p>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
        {data.service} {data.version} — {data.status}
      </p>
      <ul className="space-y-1 text-muted-foreground">
        {Object.entries(data.checks).map(([name, check]) => (
          <li key={name} className="flex justify-between gap-4">
            <span className="font-mono text-xs">{name}</span>
            <span className="text-xs">
              {check.status}
              {check.detail ? ` — ${check.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
