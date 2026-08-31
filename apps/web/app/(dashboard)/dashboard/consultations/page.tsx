"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Stethoscope, Clock, CheckCircle, XCircle } from "lucide-react";
import type { ConsultationSummary } from "@clinical-copilot/shared-types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listConsultationsApi } from "@/lib/api/consultations";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export default function ConsultationsPage() {
  const { data: consultations = [], isLoading } = useQuery({
    queryKey: ["consultations", "list"],
    queryFn: () => listConsultationsApi(),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Consultations</h1>
        <p className="text-sm text-muted-foreground">
          All consultations in this organization.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {consultations.length} consultation{consultations.length !== 1 && "s"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : consultations.length === 0 ? (
            <div className="py-8 text-center">
              <Stethoscope
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden
              />
              <p className="mt-2 text-sm text-muted-foreground">
                No consultations yet. Start one from a patient page.
              </p>
            </div>
          ) : (
            consultations.map((c) => (
              <ConsultationRow key={c.id} consultation={c} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConsultationRow({ consultation }: { consultation: ConsultationSummary }) {
  const config = STATUS_CONFIG[consultation.status] ?? STATUS_CONFIG.scheduled;
  const duration = consultation.duration_seconds
    ? formatDuration(consultation.duration_seconds)
    : null;

  return (
    <Link
      href={`/dashboard/consultations/${consultation.id}`}
      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
    >
      <div className="flex size-8 items-center justify-center rounded-full bg-muted">
        {consultation.status === "completed" ? (
          <CheckCircle className="size-4 text-muted-foreground" aria-hidden />
        ) : consultation.status === "cancelled" ? (
          <XCircle className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <Stethoscope
            className="size-4 text-muted-foreground"
            aria-hidden
          />
        )}
      </div>
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-medium">
          {consultation.chief_complaint || "Consultation"}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(consultation.created_at).toLocaleDateString()}
          {duration && (
            <>
              <Clock className="ml-2 inline size-3" aria-hidden /> {duration}
            </>
          )}
        </p>
      </div>
      <Badge variant={config.variant}>{config.label}</Badge>
    </Link>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
