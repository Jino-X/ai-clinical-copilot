-- Phase 1 — Foundation.
--
-- Extensions and the shared helpers every later table depends on. No domain
-- tables yet: organizations and membership arrive in Phase 2.
--
-- Idempotent, so it is safe to re-run against an existing database.

-- Supabase keeps extensions out of `public` so application objects and
-- extension objects do not share a namespace.
create schema if not exists extensions;

-- gen_random_uuid() for primary keys.
create extension if not exists pgcrypto with schema extensions;

-- Trigram indexes, used by patient search in Phase 3.
create extension if not exists pg_trgm with schema extensions;

-- Vector similarity for the RAG store in Phase 8. Declared now so the
-- database shape does not change late in the project (PRD §10).
create extension if not exists vector with schema extensions;


-- Keeps `updated_at` honest rather than trusting the client to send it.
--
-- `search_path` is pinned to empty and the function is not SECURITY DEFINER:
-- a mutable search_path on a trigger function is a privilege-escalation vector
-- when the trigger fires for another role.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: sets updated_at to now() on UPDATE.';
