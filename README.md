# AI Clinical Copilot

Multi-tenant clinical documentation assistant. The AI drafts; the clinician
reviews and approves. Nothing AI-generated becomes an official clinical record
without explicit approval.

See [`PRD.md`](./PRD.md) for the product specification and
[`AGENTS.md`](./AGENTS.md) for architecture and working conventions.

> **Status: Phase 3 (Patients) complete.** Supabase Auth, multi-tenant
> organizations, role-based access control, patient CRUD with search, medical
> history, and timeline are in place. There is no consultation or AI yet. Do not
> point this at real patient data.

## Layout

```
apps/web              Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui)
apps/api              FastAPI modular monolith (Python 3.13)
packages/shared-types  Types shared across the API boundary
supabase/migrations   SQL migrations, applied in filename order
infrastructure/aws    Deployment definitions (Phase 9)
```

## Prerequisites

- Node.js 20.9+ (developed on 24)
- Python 3.13
- Docker (optional — only for `docker compose`)

## Setup

```bash
# 1. Frontend dependencies (npm workspaces, from the repo root)
npm install

# 2. Environment files
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
# then fill in your Supabase project values

# 3. Backend virtualenv
cd apps/api && python3.13 -m venv .venv \
  && .venv/bin/pip install -r requirements-dev.txt && cd -
```

## Running

Two terminals:

```bash
npm run dev       # web on http://localhost:3000
npm run api:dev   # api on http://localhost:8000  (creates .venv on first run)
```

`http://localhost:3000` shows a landing page with sign-in/sign-up links.
After authenticating, you'll reach the dashboard where you can create an
organization, manage members, and search/create patients. API docs are at
`http://localhost:8000/docs` (disabled when `ENVIRONMENT=production`).

Or with Docker, backend plus a local pgvector database:

```bash
docker compose up
```

## Database

Migrations are plain SQL, applied in filename order and written to be
re-runnable:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260830000000_initial_foundation.sql
psql "$DATABASE_URL" -f supabase/migrations/20260830010000_auth_organizations.sql
psql "$DATABASE_URL" -f supabase/migrations/20260830020000_patients.sql
```

With the Supabase CLI, `supabase db push` applies the same directory.

## Checks

Run these before opening a pull request; CI runs the same commands.

```bash
npm run lint          # eslint
npm run typecheck     # tsc across workspaces
npm run build         # next build

npm run api:lint      # ruff
npm run api:typecheck # mypy (strict)
npm run api:test      # pytest

./scripts/test-db.sh  # migration + RLS behavioural tests (needs PostgreSQL)
```

## Security

- The Supabase **anon key** is the only key the browser ever sees. Row Level
  Security is the tenant isolation boundary.
- `SUPABASE_SERVICE_ROLE_KEY` and AI provider keys live only in `apps/api/.env`
  and, in production, in AWS Secrets Manager.
- `organization_id`, `patient_id` and `doctor_id` are never accepted from the
  client; they are resolved from the authenticated user.
- Logs carry identifiers, never clinical content.

Use synthetic data in development. Security features alone do not constitute
regulatory compliance — see PRD §20 before any real patient data is involved.
