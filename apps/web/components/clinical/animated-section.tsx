import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  animation?: "fade-in" | "fade-in-up" | "fade-in-down" | "scale-in";
}

export function AnimatedSection({
  children,
  className,
  delay = 0,
  animation = "fade-in-up",
}: AnimatedSectionProps) {
  return (
    <div
      className={cn(`animate-${animation} opacity-0`, className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

interface StaggeredListProps {
  children: ReactNode;
  className?: string;
  baseDelay?: number;
  stagger?: number;
}

export function StaggeredList({
  children,
  className,
  baseDelay = 0,
  stagger = 50,
}: StaggeredListProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <div
              key={i}
              className="animate-fade-in-up opacity-0"
              style={{ animationDelay: `${baseDelay + i * stagger}ms` }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
}
