"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Stethoscope,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  Trash2,
} from "lucide-react";
import type { ConsultationSummary } from "@clinical-copilot/shared-types";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PageHeader,
  StatusBadge,
  EmptyState,
  ListSkeleton,
} from "@/components/clinical";
import { ApiError } from "@/lib/api/client";
import {
  listConsultationsApi,
  deleteConsultationApi,
} from "@/lib/api/consultations";

export default function ConsultationsPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: consultations = [], isLoading } = useQuery({
    queryKey: ["consultations", "list"],
    queryFn: () => listConsultationsApi(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConsultationApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations", "list"] });
      toast.success("Consultation deleted");
      setDeleteId(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to delete"),
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
                  <ConsultationRow
                    key={c.id}
                    consultation={c}
                    index={i}
                    onDelete={() => setDeleteId(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete consultation?</DialogTitle>
            <DialogDescription>
              This will soft-delete the consultation and hide it from all views.
              The data is preserved in the database but no longer accessible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConsultationRow({
  consultation,
  index,
  onDelete,
}: {
  consultation: ConsultationSummary;
  index: number;
  onDelete: () => void;
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
    <div
      className="group flex animate-fade-in-up items-center gap-3 rounded-lg px-3 py-3 opacity-0 transition-smooth hover:bg-accent/50"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <Link
        href={`/dashboard/consultations/${consultation.id}`}
        className="flex flex-1 items-center gap-3"
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
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label="Delete consultation"
        className="opacity-0 transition-smooth group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
