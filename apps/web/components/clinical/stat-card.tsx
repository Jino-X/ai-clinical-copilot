import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href?: string;
  trend?: string;
  accent?: "primary" | "success" | "warning" | "info";
  className?: string;
}

const ACCENT_STYLES = {
  primary: {
    bg: "bg-primary/10",
    text: "text-primary",
    glow: "group-hover:shadow-primary/10",
  },
  success: {
    bg: "bg-success/10",
    text: "text-success",
    glow: "group-hover:shadow-success/10",
  },
  warning: {
    bg: "bg-warning/10",
    text: "text-warning",
    glow: "group-hover:shadow-warning/10",
  },
  info: {
    bg: "bg-info/10",
    text: "text-info",
    glow: "group-hover:shadow-info/10",
  },
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  trend,
  accent = "primary",
  className,
}: StatCardProps) {
  const styles = ACCENT_STYLES[accent];

  const Component = href ? "a" : "div";
  const linkProps = href ? { href } : {};

  return (
    <Component
      {...linkProps}
      className={cn(
        "group block animate-fade-in-up opacity-0",
        className,
      )}
      style={{ animationDelay: "50ms" }}
    >
      <Card className="card-hover overflow-hidden border-border/60 transition-smooth group-hover:shadow-lg">
        <CardContent className="flex items-center gap-4 p-5">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl transition-smooth group-hover:scale-110",
              styles.bg,
              styles.text,
            )}
          >
            <Icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <p className="text-xs text-muted-foreground">{trend}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </Component>
  );
}
