-- Simplify the role system to doctor-only.
--
-- This is a doctor-only tool: every member of an organization is a doctor
-- with full clinical access. The multi-role enum stays in the database for
-- backward compatibility (the column is NOT NULL), but the application no
-- longer distinguishes roles. All new members are created as 'doctor'.
--
-- Idempotent: safe to re-run.

-- Drop the last-owner-removal trigger first — it blocks role updates.
drop trigger if exists organization_members_protect_last_owner
  on public.organization_members;
drop function if exists public.prevent_last_owner_removal();

-- Update the organization-creation trigger to insert 'doctor' instead of 'owner'.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_members (organization_id, user_id, role, status)
  values (new.id, new.created_by, 'doctor', 'active')
  on conflict (organization_id, user_id) do nothing;
  return new;
end;
$$;

-- Migrate existing members to 'doctor'.
update public.organization_members set role = 'doctor' where role <> 'doctor';

-- --- Simplify RLS policies to use is_org_member (any active member) --------

drop policy if exists organizations_update_admins on public.organizations;
create policy organizations_update_members
  on public.organizations for update
  to authenticated
  using (public.is_org_member(id))
  with check (public.is_org_member(id));

drop policy if exists organizations_delete_owner on public.organizations;
-- No DELETE policy: organizations are not deleted through the app.

drop policy if exists organization_members_insert_admins on public.organization_members;
create policy organization_members_insert_members
  on public.organization_members for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists organization_members_update_admins on public.organization_members;
create policy organization_members_update_members
  on public.organization_members for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists organization_members_delete_admins on public.organization_members;
create policy organization_members_delete_members
  on public.organization_members for delete
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists audit_logs_select_admins on public.audit_logs;
create policy audit_logs_select_members
  on public.audit_logs for select
  to authenticated
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  );
