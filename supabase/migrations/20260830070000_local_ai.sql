-- Phase: Local AI Integration
-- Extends the existing transcripts table and adds tables for English
-- normalization, clinical extraction, and doctor-facing summaries.
--
-- Design principles (PRD §4):
-- - The original transcript is NEVER overwritten.
-- - English-normalized text, clinical extraction, and summaries are stored
--   separately.
-- - All tables carry organization_id and patient_id for RLS.
-- - All AI output is a draft until a doctor reviews and approves it.

-- ===========================================================================
-- Extend transcripts with English-normalized text
-- ===========================================================================

alter table public.transcripts
  add column if not exists english_text text,
  add column if not exists english_provider text,
  add column if not exists english_model text,
  add column if not exists english_source_language text,
  add column if not exists english_created_at timestamptz;

comment on column public.transcripts.english_text is
  'English-normalized version of the transcript. The original full_text is never overwritten (PRD §4).';

-- ===========================================================================
-- Clinical extractions table
-- ===========================================================================

create table if not exists public.clinical_extractions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  transcript_id uuid not null references public.transcripts (id) on delete cascade,
  -- The full structured extraction as JSONB.
  extraction jsonb not null,
  -- The English text that was used as input for the extraction.
  input_text text not null,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists clinical_extractions_consultation_idx
  on public.clinical_extractions (consultation_id);

create index if not exists clinical_extractions_patient_idx
  on public.clinical_extractions (patient_id);

create index if not exists clinical_extractions_organization_idx
  on public.clinical_extractions (organization_id);

-- ===========================================================================
-- Doctor-facing summaries table
-- ===========================================================================

create table if not exists public.doctor_summaries (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  summary text not null,
  source_references jsonb not null default '[]'::jsonb,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists doctor_summaries_consultation_idx
  on public.doctor_summaries (consultation_id);

create index if not exists doctor_summaries_patient_idx
  on public.doctor_summaries (patient_id);

create index if not exists doctor_summaries_organization_idx
  on public.doctor_summaries (organization_id);

-- ===========================================================================
-- RLS policies
-- ===========================================================================

alter table public.clinical_extractions enable row level security;
alter table public.doctor_summaries enable row level security;

-- Clinical extractions: organization members can read, only the backend
-- (service role) can insert.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'clinical_extractions'
       and policyname = 'clinical_extractions_org_select'
  ) then
    create policy clinical_extractions_org_select
      on public.clinical_extractions
      for select to authenticated
      using (
        organization_id in (
          select om.organization_id
            from public.organization_members om
           where om.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Doctor summaries: same pattern.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'doctor_summaries'
       and policyname = 'doctor_summaries_org_select'
  ) then
    create policy doctor_summaries_org_select
      on public.doctor_summaries
      for select to authenticated
      using (
        organization_id in (
          select om.organization_id
            from public.organization_members om
           where om.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- ===========================================================================
-- Grants
-- ===========================================================================

grant select on public.clinical_extractions to authenticated;
grant select on public.doctor_summaries to authenticated;
