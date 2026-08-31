-- Phase 4 — Consultations, consent, and audio storage.
--
-- A consultation is the central clinical workflow object. It moves through a
-- state machine: scheduled -> in_progress -> completed (or cancelled). Audio
-- is captured for transcription in Phase 5; the original audio and transcript
-- are never overwritten by AI output (PRD §4, §12).
--
-- Consent is recorded separately so it has its own audit trail and can be
-- revoked without destroying the consultation record.
--
-- Idempotent: safe to re-run.


-- ===========================================================================
-- Enums
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'consultation_status') then
    create type public.consultation_status as enum (
      'scheduled',   -- created, not yet started
      'in_progress', -- recording or actively being conducted
      'completed',   -- finished, clinical note may be pending
      'cancelled'    -- abandoned before completion
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'consent_type') then
    create type public.consent_type as enum (
      'audio_recording',
      'ai_processing'
    );
  end if;
end
$$;


-- ===========================================================================
-- Tables
-- ===========================================================================

-- A consultation session. The doctor_id is resolved from the authenticated
-- user, never accepted from the client (PRD §18).
create table if not exists public.consultations (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  -- The clinician conducting the consultation. Resolved from the JWT, never
  -- from the request body.
  doctor_id uuid not null references auth.users (id) on delete restrict,
  status public.consultation_status not null default 'scheduled',
  -- The doctor's reason for the visit, in the doctor's own words. Not AI.
  chief_complaint text,
  -- When the consultation was actually started (status -> in_progress).
  started_at timestamptz,
  -- When it was completed or cancelled.
  ended_at timestamptz,
  -- Duration in seconds, set on completion for quick display without
  -- computing from timestamps.
  duration_seconds int,
  -- A private Supabase Storage path to the original audio file. Never a
  -- public URL. The path is stored; access is via signed URLs only.
  audio_storage_path text,
  audio_content_type text,
  audio_size_bytes bigint,
  -- Free-text summary the doctor may write. Not AI-generated.
  doctor_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.consultations is
  'A consultation session. The core clinical workflow object (PRD §4).';
comment on column public.consultations.audio_storage_path is
  'Private Supabase Storage path. Access via signed URLs only (PRD §9).';
comment on column public.consultations.doctor_id is
  'The clinician. Resolved from the JWT, never from the client (PRD §18).';


-- Consent records. Each consent is a separate row so it can be revoked
-- independently and the history is preserved.
create table if not exists public.consents (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  consultation_id uuid references public.consultations (id) on delete cascade,
  consent_type public.consent_type not null,
  -- True when consent is granted, false when revoked. A new row is inserted
  -- for each grant/revoke so the history is append-only.
  granted boolean not null,
  -- Who recorded the consent. Usually the doctor, but could be staff for
  -- pre-existing consent.
  recorded_by uuid not null references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.consents is
  'Patient consent records. Append-only: revocation inserts a new row.';


-- Transcripts. The original transcript is stored here and is never
-- overwritten by AI output (PRD §4, §12). AI-generated structured data
-- lives in separate tables (Phase 5).
create table if not exists public.transcripts (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  consultation_id uuid not null references public.consultations (id)
    on delete cascade,
  -- The full transcript text. Stored as-is from the transcription provider.
  -- Never modified by AI.
  full_text text not null,
  -- The provider that generated this transcript (e.g. 'openai').
  provider text,
  -- The language code detected or specified.
  language text,
  -- Duration of the audio in seconds, if known.
  duration_seconds int,
  -- Whether speaker diarization was performed.
  has_speaker_labels boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.transcripts is
  'Original transcript. Never overwritten by AI output (PRD §4, §12).';


-- Transcript segments for speaker-separated transcripts. Optional: only
-- populated when the provider returns speaker labels.
create table if not exists public.transcript_segments (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  transcript_id uuid not null references public.transcripts (id)
    on delete cascade,
  -- 0-indexed segment number for ordering.
  segment_index int not null,
  -- 'doctor', 'patient', or 'unknown'. Free-text because providers vary.
  speaker text not null default 'unknown',
  text text not null,
  start_time_ms int,
  end_time_ms int,
  created_at timestamptz not null default now()
);

comment on table public.transcript_segments is
  'Speaker-separated transcript segments. Optional, provider-dependent.';


-- ===========================================================================
-- Indexes
-- ===========================================================================

create index if not exists consultations_organization_idx
  on public.consultations (organization_id);
create index if not exists consultations_patient_idx
  on public.consultations (patient_id, created_at desc);
create index if not exists consultations_doctor_idx
  on public.consultations (doctor_id, created_at desc);
create index if not exists consultations_status_idx
  on public.consultations (organization_id, status)
  where status in ('scheduled', 'in_progress');

create index if not exists consents_patient_idx
  on public.consents (patient_id, created_at desc);
create index if not exists consents_consultation_idx
  on public.consents (consultation_id, created_at desc);

create index if not exists transcripts_consultation_idx
  on public.transcripts (consultation_id);
create index if not exists transcript_segments_transcript_idx
  on public.transcript_segments (transcript_id, segment_index);


-- ===========================================================================
-- Authorization helpers
-- ===========================================================================

-- A consultation belongs to a patient, which belongs to an organization.
-- This helper checks that the current user is a member of that organization.
create or replace function public.is_consultation_org_member(consultation_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.consultations c
    join public.organization_members m
      on m.organization_id = c.organization_id
    where c.id = consultation_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

comment on function public.is_consultation_org_member(uuid) is
  'True when the current user is an active member of the consultation''s organization.';


-- ===========================================================================
-- Triggers
-- ===========================================================================

-- updated_at maintenance.
drop trigger if exists consultations_set_updated_at on public.consultations;
create trigger consultations_set_updated_at
  before update on public.consultations
  for each row execute function public.set_updated_at();


-- When a consultation is created, add a timeline event for it.
create or replace function public.add_consultation_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.patient_timeline_events
    (patient_id, organization_id, event_type, event_date, title, description,
     source_type, source_id)
  values
    (new.patient_id, new.organization_id, 'consultation',
     coalesce(new.started_at::date, new.created_at::date),
     coalesce(new.chief_complaint, 'Consultation'),
     coalesce('Status: ' || new.status::text, null),
     'consultations', new.id);
  return new;
end;
$$;

drop trigger if exists consultations_timeline on public.consultations;
create trigger consultations_timeline
  after insert on public.consultations
  for each row execute function public.add_consultation_timeline_event();


-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.consultations       enable row level security;
alter table public.consents            enable row level security;
alter table public.transcripts         enable row level security;
alter table public.transcript_segments enable row level security;


-- --- consultations ----------------------------------------------------------

drop policy if exists consultations_select_members on public.consultations;
create policy consultations_select_members
  on public.consultations for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists consultations_insert_clinicians on public.consultations;
create policy consultations_insert_clinicians
  on public.consultations for insert
  to authenticated
  -- Only clinicians (doctors, nurses) may start consultations. The backend
  -- enforces the permission check; RLS ensures organization_id matches.
  with check (
    public.is_org_member(organization_id)
    and doctor_id = auth.uid()
  );

drop policy if exists consultations_update_members on public.consultations;
create policy consultations_update_members
  on public.consultations for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- No DELETE policy: consultations are never deleted. A cancelled consultation
-- is marked, not removed, because it may have consent and audit records.


-- --- consents ---------------------------------------------------------------

drop policy if exists consents_select_members on public.consents;
create policy consents_select_members
  on public.consents for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists consents_insert_members on public.consents;
create policy consents_insert_members
  on public.consents for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and recorded_by = auth.uid()
  );

-- No UPDATE or DELETE: consent records are append-only. Revocation inserts
-- a new row with granted = false.


-- --- transcripts ------------------------------------------------------------

-- Transcripts are read-only from the client's perspective. They are created
-- by the backend (Phase 5 transcription pipeline), not by the client.
drop policy if exists transcripts_select_members on public.transcripts;
create policy transcripts_select_members
  on public.transcripts for select
  to authenticated
  using (public.is_org_member(organization_id));

-- No INSERT, UPDATE, or DELETE for authenticated: transcripts are written
-- by the backend with the service role.


-- --- transcript_segments ----------------------------------------------------

drop policy if exists transcript_segments_select_members on public.transcript_segments;
create policy transcript_segments_select_members
  on public.transcript_segments for select
  to authenticated
  using (public.is_org_member(organization_id));

-- No INSERT, UPDATE, or DELETE for authenticated: same as transcripts.


-- ===========================================================================
-- Grants
-- ===========================================================================

revoke all on public.consultations        from anon;
revoke all on public.consents             from anon;
revoke all on public.transcripts          from anon;
revoke all on public.transcript_segments  from anon;

grant select, insert, update on public.consultations  to authenticated;
grant select, insert         on public.consents       to authenticated;
grant select                 on public.transcripts          to authenticated;
grant select                 on public.transcript_segments  to authenticated;
