-- Phase 8 — RAG: pgvector embeddings, hybrid retrieval, patient-scoped Q&A.
--
-- Uses Supabase PostgreSQL + pgvector for the RAG system (PRD §10).
-- No separate vector database for MVP (PRD §10, §29).
--
-- Embeddings are stored for:
--   - consultations (chief complaint, doctor summary)
--   - clinical notes (SOAP content)
--   - documents (extracted text)
--   - medical history (conditions, medications, allergies)
--
-- Retrieval is always scoped by:
--   - organization_id
--   - patient_id
--   - user authorization (RLS)
--
-- Idempotent: safe to re-run. Gracefully skips when pgvector is not
-- installed (e.g., in the local RLS test harness).


-- ===========================================================================
-- Extensions
-- ===========================================================================

-- pgvector extension. Supabase pre-installs this in the extensions schema.
create extension if not exists vector with schema extensions;


-- ===========================================================================
-- Conditional creation
-- ===========================================================================
--
-- The RLS test harness runs against a plain PostgreSQL image that may not
-- have pgvector. The entire table/index/RLS block is wrapped in a DO block
-- that checks for the vector type, so the migration is a no-op when
-- pgvector is absent. In production (Supabase), pgvector is always present.

do $$
begin
  if exists (select 1 from pg_type where typname = 'vector') then

    -- =====================================================================
    -- Table
    -- =====================================================================

    create table if not exists public.record_embeddings (
      id uuid primary key default extensions.gen_random_uuid(),
      organization_id uuid not null references public.organizations (id)
        on delete cascade,
      patient_id uuid not null references public.patients (id) on delete cascade,
      source_type text not null check (
        source_type in (
          'consultation',
          'clinical_note',
          'document',
          'condition',
          'medication',
          'allergy',
          'timeline_event'
        )
      ),
      source_id uuid not null,
      source_label text not null,
      chunk_text text not null,
      embedding extensions.vector(1536) not null,
      provider text not null,
      model text not null,
      created_at timestamptz not null default now()
    );

    comment on table public.record_embeddings is
      'Embeddings of patient record chunks for RAG retrieval (PRD §10).';
    comment on column public.record_embeddings.source_type is
      'Type of source record: consultation, clinical_note, document, etc.';
    comment on column public.record_embeddings.source_id is
      'ID of the source record. Not a FK because source tables vary.';
    comment on column public.record_embeddings.embedding is
      '1536-dimensional embedding vector (OpenAI text-embedding-3-small).';

    -- =====================================================================
    -- Indexes
    -- =====================================================================

    create index if not exists record_embeddings_embedding_idx
      on public.record_embeddings using hnsw
        (embedding extensions.vector_cosine_ops)
      with (m = 16, ef_construction = 64);

    create index if not exists record_embeddings_patient_idx
      on public.record_embeddings (organization_id, patient_id);

    create index if not exists record_embeddings_source_idx
      on public.record_embeddings (source_type, source_id);

    -- =====================================================================
    -- Row Level Security
    -- =====================================================================

    alter table public.record_embeddings enable row level security;

    drop policy if exists record_embeddings_select_members
      on public.record_embeddings;
    create policy record_embeddings_select_members
      on public.record_embeddings for select
      to authenticated
      using (public.is_org_member(organization_id));

    drop policy if exists record_embeddings_insert_members
      on public.record_embeddings;
    create policy record_embeddings_insert_members
      on public.record_embeddings for insert
      to authenticated
      with check (public.is_org_member(organization_id));

    drop policy if exists record_embeddings_delete_members
      on public.record_embeddings;
    create policy record_embeddings_delete_members
      on public.record_embeddings for delete
      to authenticated
      using (public.is_org_member(organization_id));

    -- =====================================================================
    -- Grants
    -- =====================================================================

    revoke all on public.record_embeddings from anon;
    grant select, insert, delete on public.record_embeddings to authenticated;

  end if;
end $$;
