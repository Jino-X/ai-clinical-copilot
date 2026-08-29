# AGENTS.md — working notes for this repository

Read [`PRD.md`](./PRD.md) first; it is the product specification and it wins
any disagreement with this file. This file records how the code is actually
organised and how to verify it.

## Current state

**Phase 1 (Foundation) is complete. Phase 2 (Authentication) is next.**

Delivered: monorepo, Next.js app shell, FastAPI service with config/logging/
error handling/health probes, the initial SQL migration, Docker, CI.

Not built yet: authentication, organizations, patients, consultations, AI
providers, RAG, documents. `app/models`, `app/repositories`, `app/services`,
`app/providers` and `app/workers` are intentionally empty packages that later
phases fill — they mark the structure from PRD §16, they are not dead code to
be deleted.

Implement one phase at a time (PRD §26) and verify it before moving on.

## Commands

Everything runs from the repo root.

| Task | Command |
| --- | --- |
| Web dev server | `npm run dev` |
| API dev server | `npm run api:dev` |
| Web lint | `npm run lint` |
| Web + shared typecheck | `npm run typecheck` |
| Web production build | `npm run build` |
| API lint | `npm run api:lint` |
| API format | `npm run api:format` |
| API typecheck (mypy strict) | `npm run api:typecheck` |
| API tests | `npm run api:test` |

The API venv lives at `apps/api/.venv` and is built with **Python 3.13**
(`python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`).
Python 3.14 is the machine default, so use `python3.13` explicitly.

Before finishing any phase: web lint + typecheck + build, and API lint +
format + mypy + pytest must all pass.

## Frontend notes

- **Next.js 16.** Read `apps/web/node_modules/next/dist/docs/` before writing
  Next-specific code; this version differs from older training data. The traps
  that have already bitten:
  - `middleware.ts` no longer exists — it is `proxy.ts` at the app root,
    exporting a function named `proxy`.
  - `cookies()`, `headers()`, `params` and `searchParams` are **async**.
  - Route props use the generated `PageProps<'/path'>` / `LayoutProps<'/'>`
    helpers; regenerate with `next typegen`.
  - `typedRoutes: true` is enabled, so `Link` hrefs are typechecked.
  - Turbopack is the default bundler for dev *and* build.
- Do **not** set `Cache-Control` in `next.config.ts`. Next owns that header
  per-route and silently overrides it. Set it where the response object is
  under our control (`proxy.ts`, route handlers).
- Server Components by default; `"use client"` only where interactivity or a
  browser API is genuinely needed.
- shadcn/ui with the `radix-nova` style (`components.json`). Add components
  with `npx shadcn@4.19.0 add <name>` from `apps/web` — do not hand-write them.
- `lib/env.ts` is the only place that reads `process.env` on the web side.
  `process.env.X` must be referenced statically or the value is `undefined` in
  the browser.
- `lib/supabase/server.ts` is marked `server-only`. Both Supabase clients use
  the **anon key** — RLS stays in force in the Next.js process.
- All backend calls go through `lib/api/client.ts`, which parses the shared
  error envelope into `ApiError`.

## Backend notes

- Modular monolith (PRD §30). Routes stay thin; logic belongs in services.
- `app/core/config.py` is the only place that reads the environment. Secrets
  are `SecretStr` so they are redacted in reprs and tracebacks.
- Every failure returns one envelope, `{"error": {code, message, request_id}}`,
  produced by `app/core/errors.py`. Raise an `AppError` subclass; do not build
  ad-hoc `HTTPException` responses with different shapes. The web client
  parses this shape.
- Unexpected exceptions return a deliberately opaque message. An internal
  error string can leak PHI or schema detail.
- Validation errors report field paths and messages only, never the submitted
  values.
- `/health/live` must never touch a dependency, or a database blip will cause
  ECS to kill healthy tasks. `/health/ready` reports dependency state and
  returns 200 with `status: "degraded"`.
- A missing configuration is reported as `skipped`, a broken dependency as
  `error`. They are not the same thing.
- The asyncpg pool never logs an exception message — a DSN with credentials
  appears in asyncpg connection errors. Log `type(exc).__name__`.
- mypy runs `strict`. asyncpg ships no type information, so
  `disallow_untyped_calls` is relaxed for `app.db.pool` only; keep the
  exception confined there.

## Database

- Plain SQL in `supabase/migrations/`, named `<UTC timestamp>_<name>.sql`,
  applied in filename order. Write them idempotently (`if not exists`,
  `create or replace`) so re-running is safe.
- Extensions live in the `extensions` schema, per Supabase convention.
- Trigger functions pin `set search_path = ''`. A mutable search_path on a
  trigger function is a privilege-escalation vector.
- Every tenant-owned table gets `organization_id`; patient records also get
  `patient_id`. RLS on every one of them.

## Non-negotiables

These come from PRD §12, §18 and §23. Do not trade them for delivery speed.

1. AI output is a **draft** until a clinician approves it. Never write
   AI-generated clinical content directly into an official record.
2. Never invent clinical data. Absent information is
   `Not found in available patient records.`; uncertain information is
   `Requires physician verification.`
3. Never accept `organization_id`, `patient_id` or `doctor_id` from the
   client. Resolve them from the authenticated user.
4. Never expose `SUPABASE_SERVICE_ROLE_KEY`, AI provider keys or AWS secrets
   to the frontend.
5. Approved clinical notes are append-only: a change creates a new version.
6. Original audio and transcripts are never overwritten by AI output.
7. Log identifiers, not clinical content.
8. Every AI workflow needs a manual fallback that cannot lose doctor edits.
9. Synthetic patient data only, in every non-production environment.
10. Do not claim regulatory compliance because security features exist.

## Dependencies

Pinned exactly in `apps/api/requirements*.txt`; pinned or caret-ranged in the
workspace `package.json` files. Prefer a version published at least 7 days ago
— a meaningful share of supply-chain attacks are yanked within days of
publication. Do not add a vector database, Kubernetes or microservices for the
MVP (PRD §29).
