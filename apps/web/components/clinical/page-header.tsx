import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex animate-fade-in-down items-start justify-between gap-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden />
          </div>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
