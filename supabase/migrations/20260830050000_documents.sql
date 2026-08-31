-- Phase 7 — Medical documents: upload, extraction, verification.
--
-- Documents are uploaded to private Supabase Storage, processed through
-- OCR/text extraction, classified, and then medical information is extracted
-- by the AI. The doctor verifies the extracted information before it becomes
-- part of the patient record (PRD §9).
--
-- Documents must never be publicly accessible (PRD §9).
--
-- Idempotent: safe to re-run.


-- ===========================================================================
-- Enums
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_status') then
    create type public.document_status as enum (
      'uploaded',     -- file stored, no processing yet
      'processing',   -- OCR/extraction in progress
      'extracted',    -- text extracted, awaiting doctor verification
      'verified',     -- doctor verified the extracted information
      'failed'        -- processing failed; can be retried
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'document_category') then
    create type public.document_category as enum (
      'lab_report',
      'imaging_report',
      'prescription',
      'referral_letter',
      'discharge_summary',
      'clinical_note',
      'insurance_document',
      'identification',
      'other'
    );
  end if;
end
$$;


-- ===========================================================================
-- Tables
-- ===========================================================================

-- A medical document uploaded for a patient. The file itself lives in
-- private Supabase Storage; this table holds metadata and the extracted text.
create table if not exists public.medical_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  -- The doctor who uploaded the document.
  uploaded_by uuid not null references auth.users (id) on delete set null,
  -- Display name for the document (e.g., "Blood Test Results - Aug 2024").
  title text not null,
  -- Private Supabase Storage path. Never a public URL.
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  file_size_bytes bigint not null,
  status public.document_status not null default 'uploaded',
  -- AI-classified category. NULL until classification runs.
  category public.document_category,
  -- Extracted text from OCR or text extraction. NULL until extraction runs.
  -- This is the raw extracted text, not AI-processed.
  extracted_text text,
  -- AI-extracted structured medical information (JSON). NULL until the
  -- medical extraction runs. Always a draft until verified.
  extracted_data jsonb,
  -- The LLM provider/model used for extraction, for audit.
  extraction_provider text,
  extraction_model text,
  -- Who verified the extracted information.
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  -- Error message if processing failed.
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.medical_documents is
  'Medical documents uploaded for a patient (PRD §9).';
comment on column public.medical_documents.storage_path is
  'Private Supabase Storage path. Access via signed URLs only (PRD §9).';
comment on column public.medical_documents.extracted_data is
  'AI-extracted structured medical info. Draft until verified (PRD §9, §12).';


-- ===========================================================================
-- Indexes
-- ===========================================================================

create index if not exists medical_documents_patient_idx
  on public.medical_documents (patient_id, created_at desc);
create index if not exists medical_documents_organization_idx
  on public.medical_documents (organization_id, created_at desc);
create index if not exists medical_documents_status_idx
  on public.medical_documents (organization_id, status)
  where status in ('uploaded', 'processing', 'extracted', 'failed');


-- ===========================================================================
-- Triggers
-- ===========================================================================

drop trigger if exists medical_documents_set_updated_at on public.medical_documents;
create trigger medical_documents_set_updated_at
  before update on public.medical_documents
  for each row execute function public.set_updated_at();


-- When a document is verified, add a timeline event.
create or replace function public.add_document_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified' and (old.status is null or old.status <> 'verified') then
    insert into public.patient_timeline_events
      (patient_id, organization_id, event_type, event_date, title, description,
       source_type, source_id)
    values
      (new.patient_id, new.organization_id, 'document',
       coalesce(new.verified_at::date, current_date),
       coalesce(new.title, 'Document verified'),
       coalesce(new.category::text, null),
       'medical_documents', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists medical_documents_timeline on public.medical_documents;
create trigger medical_documents_timeline
  after update of status on public.medical_documents
  for each row execute function public.add_document_timeline_event();


-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.medical_documents enable row level security;


drop policy if exists medical_documents_select_members on public.medical_documents;
create policy medical_documents_select_members
  on public.medical_documents for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists medical_documents_insert_members on public.medical_documents;
create policy medical_documents_insert_members
  on public.medical_documents for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and uploaded_by = auth.uid()
  );

drop policy if exists medical_documents_update_members on public.medical_documents;
create policy medical_documents_update_members
  on public.medical_documents for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- No DELETE policy: documents are medical records and should not be deleted.
-- A document can be "replaced" by uploading a new one.


-- ===========================================================================
-- Grants
-- ===========================================================================

revoke all on public.medical_documents from anon;

grant select, insert, update on public.medical_documents to authenticated;
