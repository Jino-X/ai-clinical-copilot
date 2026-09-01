"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/sign-out";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => signOutAction())}
    >
      <LogOut className="size-3.5" aria-hidden />
      Sign out
    </Button>
  );
}
