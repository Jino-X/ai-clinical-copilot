"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import type { Route } from "next";

import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions for authentication.
 *
 * These run on the server, so the Supabase client can write cookies
 * directly. The actions are thin wrappers around Supabase Auth — validation
 * happens with Zod before any call, and errors are returned as a typed
 * result rather than thrown, so the form can display them inline.
 */

export type AuthActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const redirectAfterAuth = async (fallbackPath: Route = "/dashboard") => {
  const headerList = await headers();
  const referer = headerList.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      const redirectParam = url.searchParams.get("redirect");
      if (redirectParam && redirectParam.startsWith("/")) {
        redirect(redirectParam as Route);
      }
    } catch {
      // Invalid referer — fall through to default.
    }
  }
  redirect(fallbackPath);
};

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function loginAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Supabase returns a generic message for both wrong password and
    // non-existent user, which is the right behaviour — do not reveal
    // which one it was.
    return { ok: false, error: "Invalid email or password." };
  }

  await redirectAfterAuth();
  // redirectAfterAuth always redirects, but TypeScript doesn't know that
  // because redirect() returns never inside an async function.
  return { ok: true };
}

const signupSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Your name is required").max(200),
});

export async function signupAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const supabase = await createClient();
  const headerList = await headers();
  const origin = headerList.get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/verify`,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // Email verification is required before the user can sign in.
  redirect("/verify");
}

const resetRequestSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export async function requestPasswordResetAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const supabase = await createClient();
  const headerList = await headers();
  const origin = headerList.get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${origin}/reset`,
    },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  // Always show success — revealing whether an email exists is an info leak.
  return { ok: true };
}

const passwordUpdateSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function updatePasswordAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
