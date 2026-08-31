-- TEST HARNESS ONLY. Never applied to a Supabase project.
--
-- Reproduces the parts of a Supabase database that the migrations depend on,
-- so the RLS policies can be exercised against a plain PostgreSQL instance:
-- the `auth` schema, `auth.uid()`, and the three Supabase roles.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- In a real project this reads the claims PostgREST extracted from a verified
-- JWT. Same contract here: the subject of the current request.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- Side channel for handing an authenticated role an id it could never have
-- read through RLS, which is how an attacker-supplied id arrives in practice.
-- Deliberately not RLS-protected.
create table if not exists public.test_ids (
  name text primary key,
  id uuid not null
);
grant select on public.test_ids to authenticated, service_role;
