# Seed data

**Synthetic data only.** Never place real patient information in this
directory, and never load production data into a development database
(PRD §20).

Seed files are applied after migrations, in filename order:

```bash
psql "$DATABASE_URL" -f supabase/seed/<file>.sql
```

There is nothing to seed yet — the first seed file arrives with Phase 2
(organizations and demo clinician accounts).
