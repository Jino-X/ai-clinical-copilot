import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string; dotClass: string }
> = {
  // Condition/medication statuses
  active: { variant: "default", label: "Active", dotClass: "bg-primary" },
  resolved: { variant: "secondary", label: "Resolved", dotClass: "bg-success" },
  chronic: { variant: "destructive", label: "Chronic", dotClass: "bg-destructive" },
  recurrence: { variant: "destructive", label: "Recurrence", dotClass: "bg-destructive" },
  completed: { variant: "secondary", label: "Completed", dotClass: "bg-success" },
  discontinued: { variant: "secondary", label: "Discontinued", dotClass: "bg-muted-foreground" },
  on_hold: { variant: "outline", label: "On Hold", dotClass: "bg-warning" },

  // Consultation statuses
  scheduled: { variant: "outline", label: "Scheduled", dotClass: "bg-info" },
  in_progress: { variant: "default", label: "In Progress", dotClass: "bg-primary animate-pulse" },
  cancelled: { variant: "destructive", label: "Cancelled", dotClass: "bg-destructive" },

  // Note statuses
  draft: { variant: "outline", label: "Draft", dotClass: "bg-warning" },
  approved: { variant: "default", label: "Approved", dotClass: "bg-success" },
  rejected: { variant: "destructive", label: "Rejected", dotClass: "bg-destructive" },

  // Document statuses
  uploaded: { variant: "outline", label: "Uploaded", dotClass: "bg-info" },
  processing: { variant: "outline", label: "Processing", dotClass: "bg-warning animate-pulse" },
  extracted: { variant: "secondary", label: "Extracted", dotClass: "bg-info" },
  verified: { variant: "default", label: "Verified", dotClass: "bg-success" },
  failed: { variant: "destructive", label: "Failed", dotClass: "bg-destructive" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    variant: "outline" as const,
    label: status.replace(/_/g, " "),
    dotClass: "bg-muted-foreground",
  };

  return (
    <Badge
      variant={config.variant}
      className={cn("capitalize gap-1.5", className)}
    >
      <span className={cn("size-1.5 rounded-full", config.dotClass)} />
      {config.label}
    </Badge>
  );
}
