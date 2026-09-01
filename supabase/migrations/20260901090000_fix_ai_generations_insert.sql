-- Allow authenticated org members to insert AI generation records.
--
-- The original migration only granted SELECT to authenticated, intending
-- ai_generations to be written via the service role. But the transcription
-- and SOAP generation routes run on a tenant (RLS-enforced) connection, so
-- they need an INSERT policy too.
--
-- Idempotent: safe to re-run.

drop policy if exists ai_generations_insert_members on public.ai_generations;
create policy ai_generations_insert_members
  on public.ai_generations for insert
  to authenticated
  with check (public.is_org_member(organization_id));

-- Grant INSERT alongside the existing SELECT.
grant select, insert on public.ai_generations to authenticated;

-- Same issue for transcripts and transcript_segments: the transcription
-- route writes to them via a tenant connection.
drop policy if exists transcripts_insert_members on public.transcripts;
create policy transcripts_insert_members
  on public.transcripts for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists transcripts_update_members on public.transcripts;
create policy transcripts_update_members
  on public.transcripts for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update on public.transcripts to authenticated;

drop policy if exists transcript_segments_insert_members on public.transcript_segments;
create policy transcript_segments_insert_members
  on public.transcript_segments for insert
  to authenticated
  with check (public.is_org_member(organization_id));

grant select, insert on public.transcript_segments to authenticated;

-- Same issue for clinical_extractions and doctor_summaries: the local AI
-- routes write to them via a tenant connection.
drop policy if exists clinical_extractions_insert_members on public.clinical_extractions;
create policy clinical_extractions_insert_members
  on public.clinical_extractions for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists clinical_extractions_update_members on public.clinical_extractions;
create policy clinical_extractions_update_members
  on public.clinical_extractions for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update on public.clinical_extractions to authenticated;

drop policy if exists doctor_summaries_insert_members on public.doctor_summaries;
create policy doctor_summaries_insert_members
  on public.doctor_summaries for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists doctor_summaries_update_members on public.doctor_summaries;
create policy doctor_summaries_update_members
  on public.doctor_summaries for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update on public.doctor_summaries to authenticated;
