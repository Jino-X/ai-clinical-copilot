"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Stethoscope,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
} from "lucide-react";
import type { ConsultationSummary } from "@clinical-copilot/shared-types";

import { Card, CardContent } from "@/components/ui/card";
import {
  PageHeader,
  StatusBadge,
  EmptyState,
  ListSkeleton,
} from "@/components/clinical";
import { listConsultationsApi } from "@/lib/api/consultations";

export default function ConsultationsPage() {
  const { data: consultations = [], isLoading } = useQuery({
    queryKey: ["consultations", "list"],
    queryFn: () => listConsultationsApi(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consultations"
        description="All consultations in this organization"
        icon={Stethoscope}
      />

      <Card className="border-border/60">
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <p className="text-sm font-medium">
              {consultations.length} consultation{consultations.length !== 1 && "s"}
            </p>
          </div>

          {/* List */}
          <div className="p-2">
            {isLoading ? (
              <div className="p-3">
                <ListSkeleton count={4} />
              </div>
            ) : consultations.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="No consultations yet"
                description="Start one from a patient page to begin AI documentation."
              />
            ) : (
              <div className="space-y-0.5">
                {consultations.map((c, i) => (
                  <ConsultationRow key={c.id} consultation={c} index={i} />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConsultationRow({
  consultation,
  index,
}: {
  consultation: ConsultationSummary;
  index: number;
}) {
  const duration = consultation.duration_seconds
    ? formatDuration(consultation.duration_seconds)
    : null;

  const Icon =
    consultation.status === "completed"
      ? CheckCircle
      : consultation.status === "cancelled"
        ? XCircle
        : Stethoscope;

  const iconColor =
    consultation.status === "completed"
      ? "bg-success/10 text-success"
      : consultation.status === "cancelled"
        ? "bg-destructive/10 text-destructive"
        : consultation.status === "in_progress"
          ? "bg-primary/10 text-primary"
          : "bg-info/10 text-info";

  return (
    <Link
      href={`/dashboard/consultations/${consultation.id}`}
      className="group flex animate-fade-in-up items-center gap-3 rounded-lg px-3 py-3 opacity-0 transition-smooth hover:bg-accent/50"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-smooth group-hover:scale-110 ${iconColor}`}
      >
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium group-hover:text-primary transition-smooth">
          {consultation.chief_complaint || "Consultation"}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="size-3" aria-hidden />
          {new Date(consultation.created_at).toLocaleDateString()}
          {duration && (
            <>
              <span className="text-border">·</span>
              <Clock className="size-3" aria-hidden />
              {duration}
            </>
          )}
        </div>
      </div>
      <StatusBadge status={consultation.status} />
    </Link>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
