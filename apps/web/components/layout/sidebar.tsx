"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  Building2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: "/dashboard" | "/dashboard/patients" | "/dashboard/consultations" | "/dashboard/organization";
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Patients", href: "/dashboard/patients", icon: Users },
  { label: "Consultations", href: "/dashboard/consultations", icon: Stethoscope },
  { label: "Organization", href: "/dashboard/organization", icon: Building2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      {/* Logo / Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary/20">
          <Stethoscope className="size-4 text-sidebar-primary" aria-hidden />
        </div>
        <span className="text-sm font-semibold text-sidebar-foreground">
          Clinical Copilot
        </span>
      </div>

      {/* Navigation */}
      <ul className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item, index) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          const Icon = item.icon;

          return (
            <li
              key={item.href}
              className="animate-fade-in-up opacity-0"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-smooth",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 transition-smooth",
                    isActive
                      ? "text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground",
                  )}
                  aria-hidden
                />
                {item.label}
                {isActive && (
                  <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary-foreground/60" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs text-sidebar-foreground/40">
          AI prepares. Doctor decides.
        </p>
      </div>
    </nav>
  );
}
