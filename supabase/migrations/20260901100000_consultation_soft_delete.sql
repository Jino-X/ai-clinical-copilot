-- Add soft-delete support for consultations.
-- Mirrors the patients.deleted_at pattern: the row is never physically
-- removed; queries filter on deleted_at is null.

alter table public.consultations
  add column if not exists deleted_at timestamptz;

comment on column public.consultations.deleted_at is
  'Soft-delete timestamp. When set, the consultation is hidden from all queries.';

-- Update the list policies to exclude soft-deleted rows.
-- The existing SELECT policies already use is_org_member; we need to
-- also exclude deleted_at is not null.

drop policy if exists consultations_select_members on public.consultations;

create policy consultations_select_members
  on public.consultations
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and deleted_at is null
  );

-- Insert/Update policies: allow writes for org members, but never on
-- soft-deleted rows.
drop policy if exists consultations_insert_members on public.consultations;
create policy consultations_insert_members
  on public.consultations
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and deleted_at is null
  );

drop policy if exists consultations_update_members on public.consultations;
create policy consultations_update_members
  on public.consultations
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (
    public.is_org_member(organization_id)
    and deleted_at is null
  );
