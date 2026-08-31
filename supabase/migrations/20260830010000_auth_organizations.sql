-- Phase 2 — Authentication, organizations, roles and permissions.
--
-- Row Level Security is the tenant isolation boundary for this product
-- (PRD §18). Every table here has RLS enabled and policies that resolve the
-- caller's organizations from their membership rows, never from a value the
-- client supplied.
--
-- Idempotent: safe to re-run.


-- ===========================================================================
-- Enums
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'organization_role') then
    -- Ordered least- to most-privileged for readability only; permission
    -- checks are explicit, never based on enum ordering.
    create type public.organization_role as enum (
      'staff',   -- reception/administrative; no clinical record access
      'nurse',   -- clinical support
      'doctor',  -- full clinical access; the only role that may approve notes
      'admin',   -- manages members and organization settings
      'owner'    -- admin, plus billing and organization deletion
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'membership_status') then
    create type public.membership_status as enum (
      'invited',
      'active',
      'suspended'
    );
  end if;
end
$$;


-- ===========================================================================
-- Tables
-- ===========================================================================

create table if not exists public.organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 200),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'A tenant. Every clinical record is scoped to exactly one organization.';


-- One row per auth user. Holds the profile fields Supabase Auth does not,
-- and never any credential material.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  -- Remembers which organization the UI was last acting in, purely as a
  -- convenience. It is re-authorized against membership on every request and
  -- confers no access by itself.
  active_organization_id uuid references public.organizations (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.user_profiles.active_organization_id is
  'Last-used organization. A convenience hint only; never treated as authorization.';


create table if not exists public.organization_members (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id)
    on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null default 'doctor',
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_unique_membership
    unique (organization_id, user_id)
);

comment on table public.organization_members is
  'The authorization source of truth: which user may act in which organization, and as what.';


-- Append-only audit trail (PRD §19). Identifiers and actions only — never
-- clinical content.
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  ip_address inet,
  user_agent text,
  -- Identifiers and outcomes only. Must not carry PHI.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only. No UPDATE or DELETE policy exists, by design.';
comment on column public.audit_logs.metadata is
  'Identifiers and outcomes only. Never clinical content (PRD §19).';


-- ===========================================================================
-- Indexes
-- ===========================================================================

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id)
  where status = 'active';

create index if not exists organization_members_organization_id_idx
  on public.organization_members (organization_id);

create index if not exists audit_logs_organization_created_at_idx
  on public.audit_logs (organization_id, created_at desc);

create index if not exists audit_logs_actor_created_at_idx
  on public.audit_logs (actor_user_id, created_at desc);


-- ===========================================================================
-- Authorization helpers
--
-- SECURITY DEFINER so a policy on organization_members can query
-- organization_members without recursing into its own policy. search_path is
-- pinned to empty: a mutable search_path on a SECURITY DEFINER function is a
-- privilege-escalation vector.
-- ===========================================================================

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

comment on function public.is_org_member(uuid) is
  'True when the current user has an active membership in the organization.';


create or replace function public.has_org_role(
  org_id uuid,
  allowed public.organization_role[]
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed)
  );
$$;


-- Organizations the current user shares with the given user. Used by the
-- user_profiles read policy so members can see each other's names without
-- exposing the whole user table.
create or replace function public.shares_org_with(other_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = other_user_id
      and theirs.status = 'active'
  );
$$;


-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Every auth user gets a profile. Runs as SECURITY DEFINER because the
-- inserting role is the Auth service, not the new user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Keep the profile email in step with the authoritative one in auth.users.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_profiles
     set email = new.email
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();


-- Whoever creates an organization owns it. Done in a trigger so there is no
-- window in which an organization exists with no members — during which the
-- RLS read policy would hide it from its own creator.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_members (organization_id, user_id, role, status)
  values (new.id, new.created_by, 'owner', 'active')
  on conflict (organization_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();


-- An organization with no owner cannot be administered, and its billing and
-- deletion paths become unreachable. Block the last one from leaving.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners int;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  -- An UPDATE that leaves the row an active owner is not a removal.
  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  select count(*) into remaining_owners
  from public.organization_members m
  where m.organization_id = old.organization_id
    and m.role = 'owner'
    and m.status = 'active'
    and m.id <> old.id;

  if remaining_owners = 0 then
    raise exception 'organization must retain at least one active owner'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists organization_members_protect_last_owner
  on public.organization_members;
create trigger organization_members_protect_last_owner
  before update or delete on public.organization_members
  for each row execute function public.prevent_last_owner_removal();


-- updated_at maintenance, using the helper from the Phase 1 migration.
drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists organization_members_set_updated_at
  on public.organization_members;
create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();


-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.organizations        enable row level security;
alter table public.user_profiles        enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_logs           enable row level security;

-- Policies are dropped first so this migration can be re-run after a policy
-- is edited.

-- --- organizations ---------------------------------------------------------

drop policy if exists organizations_select_members on public.organizations;
create policy organizations_select_members
  on public.organizations for select
  to authenticated
  using (public.is_org_member(id));

drop policy if exists organizations_insert_self on public.organizations;
create policy organizations_insert_self
  on public.organizations for insert
  to authenticated
  -- Any authenticated user may create an organization, but only as themselves;
  -- the trigger then makes them its owner.
  with check (created_by = auth.uid());

drop policy if exists organizations_update_admins on public.organizations;
create policy organizations_update_admins
  on public.organizations for update
  to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists organizations_delete_owner on public.organizations;
create policy organizations_delete_owner
  on public.organizations for delete
  to authenticated
  using (public.has_org_role(id, array['owner']::public.organization_role[]));


-- --- user_profiles ---------------------------------------------------------

drop policy if exists user_profiles_select_self_or_colleague on public.user_profiles;
create policy user_profiles_select_self_or_colleague
  on public.user_profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_org_with(id));

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self
  on public.user_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT or DELETE policy: profiles are created by the auth trigger and
-- removed by the cascade from auth.users.


-- --- organization_members --------------------------------------------------

drop policy if exists organization_members_select_members on public.organization_members;
create policy organization_members_select_members
  on public.organization_members for select
  to authenticated
  -- `user_id = auth.uid()` is not redundant: it lets a user see their own
  -- pending invitation, which is_org_member() excludes because it is not yet
  -- active.
  using (user_id = auth.uid() or public.is_org_member(organization_id));

drop policy if exists organization_members_insert_admins on public.organization_members;
create policy organization_members_insert_admins
  on public.organization_members for insert
  to authenticated
  with check (
    public.has_org_role(
      organization_id, array['owner', 'admin']::public.organization_role[]
    )
  );

drop policy if exists organization_members_update_admins on public.organization_members;
create policy organization_members_update_admins
  on public.organization_members for update
  to authenticated
  using (
    public.has_org_role(
      organization_id, array['owner', 'admin']::public.organization_role[]
    )
  )
  with check (
    public.has_org_role(
      organization_id, array['owner', 'admin']::public.organization_role[]
    )
  );

drop policy if exists organization_members_delete_admins on public.organization_members;
create policy organization_members_delete_admins
  on public.organization_members for delete
  to authenticated
  using (
    public.has_org_role(
      organization_id, array['owner', 'admin']::public.organization_role[]
    )
  );


-- --- audit_logs -----------------------------------------------------------

drop policy if exists audit_logs_select_admins on public.audit_logs;
create policy audit_logs_select_admins
  on public.audit_logs for select
  to authenticated
  using (
    organization_id is not null
    and public.has_org_role(
      organization_id, array['owner', 'admin']::public.organization_role[]
    )
  );

-- Deliberately no INSERT, UPDATE or DELETE policy for `authenticated`. The
-- backend writes audit entries with the service role. An audit trail a user
-- can write to, edit or erase is not an audit trail.


-- ===========================================================================
-- Grants
--
-- RLS filters rows; grants decide whether the role may attempt the statement
-- at all. Both are required — Supabase's default privileges are permissive.
-- ===========================================================================

revoke all on public.organizations        from anon;
revoke all on public.user_profiles        from anon;
revoke all on public.organization_members from anon;
revoke all on public.audit_logs           from anon;

grant select, insert, update, delete on public.organizations to authenticated;
grant select, update                 on public.user_profiles to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select                         on public.audit_logs to authenticated;

-- Even for the service role, audit history is append-only.
revoke update, delete on public.audit_logs from service_role;
