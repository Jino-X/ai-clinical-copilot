# AGENTS.md — working notes for this repository

Read [`PRD.md`](./PRD.md) first; it is the product specification and it wins
any disagreement with this file. This file records how the code is actually
organised and how to verify it.

## Current state

**Phases 1–8 are complete. Phase 9 (Production) is next.**

Delivered in Phase 1: monorepo, Next.js app shell, FastAPI service with
config/logging/error handling/health probes, the initial SQL migration,
Docker, CI.

Delivered in Phase 2: Supabase Auth integration (login, signup, password
reset, email verification), user profiles, organizations, organization
memberships with roles (owner/admin/doctor/nurse/staff), role-based
permissions, audit logging, RLS policies and behavioural tests, backend JWT
verification (JWKS + legacy symmetric), `proxy.ts` session refresh, protected
dashboard with organization onboarding and member management.

Delivered in Phase 3: patient CRUD with trigram search, patient contacts,
medical history (conditions, medications, allergies), patient timeline with
trigger-generated events, audit logging for patient views/creates/updates,
RLS policies for all patient-scoped tables, frontend patient list/search,
patient detail page with tabbed overview/conditions/medications/allergies/
timeline, and new-patient form.

Delivered in Phase 4: consultation sessions with state machine (scheduled →
in_progress → completed/cancelled), patient consent (audio recording and AI
processing, append-only), Supabase Storage integration for secure audio
upload via signed URLs, transcript and transcript_segments tables, RLS
policies for all consultation-scoped tables, audit logging for consultation
started/completed/cancelled, frontend consultation list, detail page with
consent recording and browser-based audio recording via MediaRecorder API,
and "Start consultation" button on patient detail page.

Delivered in Phase 5: AI provider interfaces (LLM and Transcription) with
OpenAI implementations, provider factory for config-driven selection, SOAP
note generation with clinical safety prompts (never invent data, mark
uncertainty, Assessment/Plan are drafts), clinical note versioning (v1 =
AI-generated, v2 = doctor-edited, v3 = doctor-approved; approved notes are
append-only), transcription endpoint (audio → transcript, original never
overwritten), SOAP generation endpoint (transcript → SOAP draft), doctor
editing/approval/rejection workflow, ai_generations audit table, RLS policies
for clinical_notes/clinical_note_versions/ai_generations, frontend SOAP note
editor with edit/approve/reject UI and version history, transcription trigger
button on consultation page.

Delivered in Phase 6: patient intelligence — AI-generated patient summary
(conditions, medications, allergies, recent activity, source references),
visit comparison (new/changed/improved/worsened symptoms, medication changes,
important changes — never infers without supporting data, PRD §7), patient
history Q&A (answers only from authorized records, provides source references,
PRD §8), PatientContextBuilder aggregating patient data into LLM context,
patient consultations list endpoint, frontend PatientIntelligence component
with three tabs (Summary, Compare, Ask) integrated into patient detail page.

Delivered in Phase 7: medical documents — upload to private Supabase Storage
(PDF, JPG, PNG, DOCX, TXT), text extraction, AI classification (lab report,
imaging, prescription, etc.), AI medical information extraction (key findings,
medications, conditions, follow-up — always a draft), doctor verification
workflow (verify → timeline event), document status machine (uploaded →
processing → extracted → verified/failed), RLS on medical_documents, timeline
trigger on verification, audit logging for document upload/view/extraction,
frontend PatientDocuments component with upload, list, detail view, extraction
trigger, and verify button integrated as Documents tab on patient detail page.

Delivered in Phase 8: RAG — pgvector extension, EmbeddingProvider interface
with OpenAI implementation (text-embedding-3-small, 1536 dimensions),
EmbeddingService indexing consultations/clinical notes/documents/medical
history, RagService with hybrid retrieval (vector similarity + keyword
search, cosine distance, HNSW index), RAG Q&A endpoint with source references
for every answer, embedding index endpoint, index status endpoint, RLS on
record_embeddings (scoped by organization_id + patient_id, PRD §10), audit
logging for indexing and RAG Q&A, frontend RAG tab with index button, index
status display, Q&A interface with source reference badges (source type,
label, similarity %, match type).

Delivered in Local AI Integration: IndicConformer STT provider
(AI4Bharat 600M multilingual, lazy-loaded, ffmpeg audio conversion, 16kHz
mono), OllamaLLMProvider (Qwen3 8B via Ollama native chat API with structured
JSON output), TranslationProvider abstraction with LocalTranslationProvider
(uses Ollama/Qwen3 for Tamil→English normalization, preserves medical
terminology), ClinicalExtractionService (structured Pydantic schema, never
invents data), VisitComparisonService (new/improved/worsened/unchanged/
resolved/unknown), DoctorSummaryService (combines Supabase patient records +
current extraction + comparison), migration extending transcripts with
english_text column + clinical_extractions + doctor_summaries tables (RLS
on all), local_ai routes (normalize, extract, compare, summary, processing-
status, get extraction, get summary), frontend AiPipeline component with
stage badges, individual step buttons, full pipeline runner, extraction
display (symptoms, conditions, medications, allergies, uncertainties),
visit comparison display (color-coded change types), doctor summary display
with source references.

Not built yet: production hardening (Phase 9).
`app/workers` is an intentionally empty package that later phases fill — it
marks the structure from PRD §16, it is not dead code to be deleted.

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
