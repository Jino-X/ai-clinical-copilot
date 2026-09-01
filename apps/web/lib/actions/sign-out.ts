"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out server action.
 *
 * This lives outside the (auth) route group so that client components
 * in other route groups (e.g. the dashboard Header) can import it
 * without triggering Turbopack module resolution issues.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
