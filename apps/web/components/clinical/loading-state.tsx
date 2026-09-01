import { type LucideIcon, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoadingStateProps {
  icon?: LucideIcon;
  label?: string;
  className?: string;
}

export function LoadingState({
  icon: Icon = Loader2,
  label = "Loading…",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 animate-fade-in",
        className,
      )}
    >
      <Icon className="size-6 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <div className="size-12 shrink-0 rounded-xl shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded shimmer" />
          <div className="h-6 w-32 rounded shimmer" />
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg p-3 animate-fade-in"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="size-10 shrink-0 rounded-full shimmer" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 rounded shimmer" />
            <div className="h-3 w-24 rounded shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}
