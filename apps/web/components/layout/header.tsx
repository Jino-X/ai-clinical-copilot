"use client";

import { useState } from "react";
import { User as UserIcon, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/auth/sign-out-button";

interface HeaderProps {
  displayName: string;
}

export function Header({ displayName }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md">
      {/* Left: could add breadcrumbs or page title here */}
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 sm:flex">
          <span className="size-1.5 animate-pulse rounded-full bg-success" />
          <span className="text-xs font-medium text-success">Connected</span>
        </div>
      </div>

      {/* Right: User menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-smooth hover:bg-muted"
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials || <UserIcon className="size-4" aria-hidden />}
          </div>
          <span className="hidden text-sm font-medium sm:block">
            {displayName}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              menuOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right animate-scale-in rounded-xl border border-border bg-popover p-1.5 shadow-lg shadow-primary/5">
              <div className="border-b border-border px-3 py-2.5">
                <p className="text-sm font-medium">Signed in as</p>
                <p className="truncate text-xs text-muted-foreground">
                  {displayName}
                </p>
              </div>
              <div className="pt-1.5">
                <SignOutButton />
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
