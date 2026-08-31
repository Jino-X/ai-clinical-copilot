-- Phase 3 — Patients, medical history, and timeline.
--
-- Every table here is tenant-scoped (organization_id) and, where applicable,
-- patient-scoped (patient_id). RLS resolves the caller's organizations from
-- their membership rows, never from a value the client supplied (PRD §18).
--
-- Idempotent: safe to re-run.


-- ===========================================================================
-- Enums
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sex') then
    create type public.sex as enum ('male', 'female', 'other', 'unknown');
  end if;

  if not exists (select 1 from pg_type where typname = 'condition_status') then
    create type public.condition_status as enum (
      'active',
      'resolved',
      'chronic',
      'recurrence'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'medication_status') then
    create type public.medication_status as enum (
      'active',
      'completed',
      'discontinued',
      'on_hold'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'allergy_severity') then
    create type public.allergy_severity as enum (
      'mild',
      'moderate',
      'severe'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'timeline_event_type') then
    create type public.timeline_event_type as enum (
      'consultation',
      'diagnosis',
      'medication',
      'lab_report',
      'document',
      'procedure',
      'follow_up',
      'allergy',
      'condition'
    );
  end if;
end
$$;


-- ===========================================================================
-- Tables
-- ===========================================================================

-- The core patient record. Tenant-scoped; never cross-organization.
create table if not exists public.patients (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  -- The patient's own identifiers, not the doctor's.
  first_name text not null check (length(btrim(first_name)) >= 1),
  last_name text not null check (length(btrim(last_name)) >= 1),
  date_of_birth date,
  sex public.sex not null default 'unknown',
  -- A national or clinic-internal identifier. Stored as-is; no validation of
  -- format is performed because formats vary by jurisdiction.
  national_id text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  postal_code text,
  country text,
  emergency_contact_name text,
  emergency_contact_phone text,
  -- Free-text notes the receptionist or doctor may add. Not clinical content.
  notes text,
  -- Soft delete: a deleted patient's records remain for audit but are hidden
  -- from normal queries.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patients is
  'A patient record. Tenant-scoped via organization_id (PRD §17, §18).';
comment on column public.patients.deleted_at is
  'Soft-delete timestamp. NULL means the patient is active.';


-- Separate contacts for a patient (family, caregiver, insurance, etc.).
create table if not exists public.patient_contacts (
  id uuid primary key default extensions.gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  name text not null check (length(btrim(name)) >= 1),
  relationship text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patient_contacts is
  'Additional contacts for a patient (family, caregiver, insurance).';


-- Medical conditions (diagnoses). The catalogue is free-text rather than a
-- fixed list because coding systems (ICD-10, SNOMED) vary by region and the
-- MVP does not ship a coding service.
create table if not exists public.patient_conditions (
  id uuid primary key default extensions.gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  name text not null check (length(btrim(name)) >= 1),
  status public.condition_status not null default 'active',
  -- ISO date string or free-text date; the MVP does not enforce a format.
  onset_date date,
  resolved_date date,
  notes text,
  created_by uuid not null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patient_conditions is
  'Medical conditions/diagnoses for a patient.';


-- Medications a patient is taking or has taken.
create table if not exists public.patient_medications (
  id uuid primary key default extensions.gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  name text not null check (length(btrim(name)) >= 1),
  dosage text,
  frequency text,
  route text,
  status public.medication_status not null default 'active',
  start_date date,
  end_date date,
  notes text,
  created_by uuid not null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patient_medications is
  'Medications prescribed to or taken by a patient.';


-- Allergies and adverse reactions.
create table if not exists public.patient_allergies (
  id uuid primary key default extensions.gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  allergen text not null check (length(btrim(allergen)) >= 1),
  reaction text,
  severity public.allergy_severity,
  notes text,
  created_by uuid not null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patient_allergies is
  'Allergies and adverse reactions for a patient.';


-- A chronological timeline of clinically significant events for a patient.
-- Each event references its source record so the doctor can drill in.
-- Events are created by the services that create the source records
-- (consultation, condition, medication, etc.), not by the client directly.
create table if not exists public.patient_timeline_events (
  id uuid primary key default extensions.gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  event_type public.timeline_event_type not null,
  -- The date the event occurred, for ordering. May differ from created_at
  -- (e.g. a lab report from last week entered today).
  event_date date not null default current_date,
  title text not null,
  description text,
  -- Polymorphic reference to the source record. Kept as text so a future
  -- table can be referenced without a migration.
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.patient_timeline_events is
  'Chronological timeline of clinically significant events (PRD §6).';
comment on column public.patient_timeline_events.source_type is
  'The table the source record lives in (e.g. patient_conditions).';
comment on column public.patient_timeline_events.source_id is
  'The primary key of the source record.';


-- ===========================================================================
-- Indexes
-- ===========================================================================

-- Tenant filter is the first predicate on every patient query.
create index if not exists patients_organization_id_idx
  on public.patients (organization_id);

-- Soft-delete filter: most queries exclude deleted patients.
create index if not exists patients_organization_active_idx
  on public.patients (organization_id)
  where deleted_at is null;

-- Trigram search on the name columns (PRD §3: search patient).
-- The operator class is schema-qualified because pg_trgm lives in the
-- `extensions` schema (per Supabase convention), not in `public`.
create index if not exists patients_first_name_trgm_idx
  on public.patients using gin (first_name extensions.gin_trgm_ops);
create index if not exists patients_last_name_trgm_idx
  on public.patients using gin (last_name extensions.gin_trgm_ops);

-- Patient-scoped tables: filter by patient_id within a tenant.
create index if not exists patient_contacts_patient_id_idx
  on public.patient_contacts (patient_id);
create index if not exists patient_conditions_patient_id_idx
  on public.patient_conditions (patient_id);
create index if not exists patient_medications_patient_id_idx
  on public.patient_medications (patient_id);
create index if not exists patient_allergies_patient_id_idx
  on public.patient_allergies (patient_id);
create index if not exists patient_timeline_events_patient_date_idx
  on public.patient_timeline_events (patient_id, event_date desc);


-- ===========================================================================
-- Authorization helpers
-- ===========================================================================

-- A patient belongs to exactly one organization. This helper checks that the
-- current user is a member of that organization, so every patient-scoped
-- table can reuse it without duplicating the join.
create or replace function public.is_patient_org_member(patient_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.patients p
    join public.organization_members m
      on m.organization_id = p.organization_id
    where p.id = patient_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

comment on function public.is_patient_org_member(uuid) is
  'True when the current user is an active member of the patient''s organization.';


-- ===========================================================================
-- Triggers
-- ===========================================================================

-- updated_at maintenance for all new tables.
drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

drop trigger if exists patient_contacts_set_updated_at on public.patient_contacts;
create trigger patient_contacts_set_updated_at
  before update on public.patient_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists patient_conditions_set_updated_at on public.patient_conditions;
create trigger patient_conditions_set_updated_at
  before update on public.patient_conditions
  for each row execute function public.set_updated_at();

drop trigger if exists patient_medications_set_updated_at on public.patient_medications;
create trigger patient_medications_set_updated_at
  before update on public.patient_medications
  for each row execute function public.set_updated_at();

drop trigger if exists patient_allergies_set_updated_at on public.patient_allergies;
create trigger patient_allergies_set_updated_at
  before update on public.patient_allergies
  for each row execute function public.set_updated_at();


-- When a condition is created, add a timeline event for it.
create or replace function public.add_condition_timeline_event()
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
    (new.patient_id, new.organization_id, 'condition',
     coalesce(new.onset_date, current_date),
     new.name,
     coalesce('Status: ' || new.status::text, null),
     'patient_conditions', new.id);
  return new;
end;
$$;

drop trigger if exists patient_conditions_timeline on public.patient_conditions;
create trigger patient_conditions_timeline
  after insert on public.patient_conditions
  for each row execute function public.add_condition_timeline_event();


-- When a medication is created, add a timeline event for it.
create or replace function public.add_medication_timeline_event()
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
    (new.patient_id, new.organization_id, 'medication',
     coalesce(new.start_date, current_date),
     new.name,
     coalesce(new.dosage, null),
     'patient_medications', new.id);
  return new;
end;
$$;

drop trigger if exists patient_medications_timeline on public.patient_medications;
create trigger patient_medications_timeline
  after insert on public.patient_medications
  for each row execute function public.add_medication_timeline_event();


-- When an allergy is created, add a timeline event for it.
create or replace function public.add_allergy_timeline_event()
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
    (new.patient_id, new.organization_id, 'allergy',
     current_date,
     'Allergy: ' || new.allergen,
     coalesce(new.reaction, null),
     'patient_allergies', new.id);
  return new;
end;
$$;

drop trigger if exists patient_allergies_timeline on public.patient_allergies;
create trigger patient_allergies_timeline
  after insert on public.patient_allergies
  for each row execute function public.add_allergy_timeline_event();


-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.patients               enable row level security;
alter table public.patient_contacts       enable row level security;
alter table public.patient_conditions     enable row level security;
alter table public.patient_medications    enable row level security;
alter table public.patient_allergies      enable row level security;
alter table public.patient_timeline_events enable row level security;


-- --- patients ---------------------------------------------------------------

drop policy if exists patients_select_members on public.patients;
create policy patients_select_members
  on public.patients for select
  to authenticated
  using (public.is_org_member(organization_id) and deleted_at is null);

drop policy if exists patients_insert_members on public.patients;
create policy patients_insert_members
  on public.patients for insert
  to authenticated
  -- Any member can create a patient record; the organization_id is forced
  -- to the caller's org by the backend, never accepted from the client.
  with check (public.is_org_member(organization_id));

drop policy if exists patients_update_members on public.patients;
create policy patients_update_members
  on public.patients for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Soft delete only: deleted_at is set, the row is never physically removed
-- because it may be referenced by clinical records in later phases.
drop policy if exists patients_delete_members on public.patients;
create policy patients_delete_members
  on public.patients for delete
  to authenticated
  using (public.is_org_member(organization_id));


-- --- patient_contacts -------------------------------------------------------

drop policy if exists patient_contacts_select_members on public.patient_contacts;
create policy patient_contacts_select_members
  on public.patient_contacts for select
  to authenticated
  using (public.is_patient_org_member(patient_id));

drop policy if exists patient_contacts_insert_members on public.patient_contacts;
create policy patient_contacts_insert_members
  on public.patient_contacts for insert
  to authenticated
  with check (public.is_patient_org_member(patient_id));

drop policy if exists patient_contacts_update_members on public.patient_contacts;
create policy patient_contacts_update_members
  on public.patient_contacts for update
  to authenticated
  using (public.is_patient_org_member(patient_id))
  with check (public.is_patient_org_member(patient_id));

drop policy if exists patient_contacts_delete_members on public.patient_contacts;
create policy patient_contacts_delete_members
  on public.patient_contacts for delete
  to authenticated
  using (public.is_patient_org_member(patient_id));


-- --- patient_conditions -----------------------------------------------------

drop policy if exists patient_conditions_select_members on public.patient_conditions;
create policy patient_conditions_select_members
  on public.patient_conditions for select
  to authenticated
  using (public.is_patient_org_member(patient_id));

drop policy if exists patient_conditions_insert_members on public.patient_conditions;
create policy patient_conditions_insert_members
  on public.patient_conditions for insert
  to authenticated
  with check (public.is_patient_org_member(patient_id));

drop policy if exists patient_conditions_update_members on public.patient_conditions;
create policy patient_conditions_update_members
  on public.patient_conditions for update
  to authenticated
  using (public.is_patient_org_member(patient_id))
  with check (public.is_patient_org_member(patient_id));

drop policy if exists patient_conditions_delete_members on public.patient_conditions;
create policy patient_conditions_delete_members
  on public.patient_conditions for delete
  to authenticated
  using (public.is_patient_org_member(patient_id));


-- --- patient_medications ----------------------------------------------------

drop policy if exists patient_medications_select_members on public.patient_medications;
create policy patient_medications_select_members
  on public.patient_medications for select
  to authenticated
  using (public.is_patient_org_member(patient_id));

drop policy if exists patient_medications_insert_members on public.patient_medications;
create policy patient_medications_insert_members
  on public.patient_medications for insert
  to authenticated
  with check (public.is_patient_org_member(patient_id));

drop policy if exists patient_medications_update_members on public.patient_medications;
create policy patient_medications_update_members
  on public.patient_medications for update
  to authenticated
  using (public.is_patient_org_member(patient_id))
  with check (public.is_patient_org_member(patient_id));

drop policy if exists patient_medications_delete_members on public.patient_medications;
create policy patient_medications_delete_members
  on public.patient_medications for delete
  to authenticated
  using (public.is_patient_org_member(patient_id));


-- --- patient_allergies ------------------------------------------------------

drop policy if exists patient_allergies_select_members on public.patient_allergies;
create policy patient_allergies_select_members
  on public.patient_allergies for select
  to authenticated
  using (public.is_patient_org_member(patient_id));

drop policy if exists patient_allergies_insert_members on public.patient_allergies;
create policy patient_allergies_insert_members
  on public.patient_allergies for insert
  to authenticated
  with check (public.is_patient_org_member(patient_id));

drop policy if exists patient_allergies_update_members on public.patient_allergies;
create policy patient_allergies_update_members
  on public.patient_allergies for update
  to authenticated
  using (public.is_patient_org_member(patient_id))
  with check (public.is_patient_org_member(patient_id));

drop policy if exists patient_allergies_delete_members on public.patient_allergies;
create policy patient_allergies_delete_members
  on public.patient_allergies for delete
  to authenticated
  using (public.is_patient_org_member(patient_id));


-- --- patient_timeline_events ------------------------------------------------

-- Timeline events are read-only from the client's perspective. They are
-- created by triggers and by backend services, never by the client directly.
drop policy if exists patient_timeline_events_select_members on public.patient_timeline_events;
create policy patient_timeline_events_select_members
  on public.patient_timeline_events for select
  to authenticated
  using (public.is_patient_org_member(patient_id));

-- No INSERT, UPDATE, or DELETE policy for authenticated: timeline events
-- are system-generated. The backend writes them with the service role.


-- ===========================================================================
-- Grants
-- ===========================================================================

revoke all on public.patients                from anon;
revoke all on public.patient_contacts        from anon;
revoke all on public.patient_conditions      from anon;
revoke all on public.patient_medications     from anon;
revoke all on public.patient_allergies       from anon;
revoke all on public.patient_timeline_events from anon;

grant select, insert, update, delete on public.patients         to authenticated;
grant select, insert, update, delete on public.patient_contacts to authenticated;
grant select, insert, update, delete on public.patient_conditions   to authenticated;
grant select, insert, update, delete on public.patient_medications  to authenticated;
grant select, insert, update, delete on public.patient_allergies    to authenticated;
grant select                         on public.patient_timeline_events to authenticated;
