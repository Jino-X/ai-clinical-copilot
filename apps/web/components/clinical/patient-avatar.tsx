import { User } from "lucide-react";

import { cn } from "@/lib/utils";

interface PatientAvatarProps {
  name?: string;
  firstName?: string;
  lastName?: string;
  sex?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_STYLES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

export function PatientAvatar({
  name,
  firstName,
  lastName,
  sex,
  size = "md",
  className,
}: PatientAvatarProps) {
  const fullName = name ?? `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Color based on sex for subtle visual distinction
  const bgClass =
    sex === "male"
      ? "bg-info/15 text-info"
      : sex === "female"
        ? "bg-primary/15 text-primary"
        : "bg-accent text-accent-foreground";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold transition-smooth",
        SIZE_STYLES[size],
        bgClass,
        className,
      )}
    >
      {initials || <User className="size-1/2" aria-hidden />}
    </div>
  );
}
