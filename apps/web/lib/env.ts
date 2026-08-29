import { z } from "zod";

/**
 * Public (browser-exposed) environment. Anything here is compiled into the
 * client bundle, so it must never contain a secret. Server-only secrets
 * (service role key, AI provider keys) belong to the FastAPI backend.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_API_URL: z.string().url(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * `process.env.X` must be referenced statically so the Next.js compiler can
 * inline the value into the client bundle. Destructuring `process.env` or
 * indexing it dynamically yields `undefined` in the browser.
 */
const rawPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
};

let cached: PublicEnv | null = null;

/**
 * Throws on misconfiguration rather than letting an unconfigured app fail
 * later with an opaque network or auth error.
 */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;

  const parsed = publicEnvSchema.safeParse(rawPublicEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid public environment configuration:\n${issues}\n\n` +
        `Copy .env.example to apps/web/.env.local and fill in the values.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Non-throwing variant, for surfacing configuration state in the UI. */
export function checkPublicEnv():
  | { ok: true; env: PublicEnv }
  | { ok: false; missing: string[] } {
  const parsed = publicEnvSchema.safeParse(rawPublicEnv);
  if (parsed.success) return { ok: true, env: parsed.data };
  return {
    ok: false,
    missing: [...new Set(parsed.error.issues.map((i) => i.path.join(".")))],
  };
}
