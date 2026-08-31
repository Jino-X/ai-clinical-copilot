-- Behavioural test of the Phase 2 RLS policies against a real PostgreSQL.
--
-- Run with `npm run db:test` (see scripts/test-db.sh). These assert what a
-- caller can and cannot see or write, not merely that the SQL parses — RLS is
-- the tenant isolation boundary, so a policy regression is a data breach.
--
-- Each test runs as `authenticated` with `request.jwt.claims` set to a
-- subject, which is exactly how PostgREST presents a verified JWT.

\set ON_ERROR_STOP on
\set ALICE '11111111-1111-1111-1111-111111111111'
\set BOB   '22222222-2222-2222-2222-222222222222'
\set CAROL '33333333-3333-3333-3333-333333333333'

-- Seed auth users as the Auth service would. Exercises handle_new_user().
insert into auth.users (id, email, raw_user_meta_data) values
  (:'ALICE', 'alice@example.test', '{"full_name":"Alice Owner"}'),
  (:'BOB',   'bob@example.test',   '{"full_name":"Bob Doctor"}'),
  (:'CAROL', 'carol@example.test', '{}');

do $$
declare n int;
begin
  select count(*) into n from public.user_profiles;
  if n <> 3 then
    raise exception 'FAIL: auth trigger did not create 3 profiles (got %)', n;
  end if;
  if (select full_name from public.user_profiles
      where email = 'alice@example.test') <> 'Alice Owner' then
    raise exception 'FAIL: full_name not copied from user metadata';
  end if;
  if (select full_name from public.user_profiles
      where email = 'carol@example.test') is not null then
    raise exception 'FAIL: empty metadata full_name should be null, not ""';
  end if;
  raise notice 'PASS: auth.users trigger creates profiles';
end $$;


-- === Alice creates an organization ========================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

insert into public.organizations (name, created_by)
values ('Alice Clinic', '11111111-1111-1111-1111-111111111111');

do $$
begin
  if (select count(*) from public.organizations) <> 1 then
    raise exception 'FAIL: creator cannot see their own organization';
  end if;
  if (select role from public.organization_members
      where user_id = auth.uid()) <> 'owner' then
    raise exception 'FAIL: creator was not made owner';
  end if;
  raise notice 'PASS: organization creation makes the creator an owner, visibly';
end $$;
commit;


-- Alice must not be able to create an organization owned by someone else.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
do $$
begin
  insert into public.organizations (name, created_by)
  values ('Impersonated', '22222222-2222-2222-2222-222222222222');
  raise exception 'FAIL: was able to create an organization as another user';
exception
  when insufficient_privilege then
    raise notice 'PASS: cannot create an organization attributed to another user';
end $$;
commit;


-- === Bob creates his own, separate organization ============================
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);

insert into public.organizations (name, created_by)
values ('Bob Clinic', '22222222-2222-2222-2222-222222222222');

do $$
begin
  -- The tenant isolation assertion: Bob sees his organization and only his.
  if (select count(*) from public.organizations) <> 1 then
    raise exception 'FAIL: tenant leak — Bob sees % organizations',
      (select count(*) from public.organizations);
  end if;
  if (select name from public.organizations) <> 'Bob Clinic' then
    raise exception 'FAIL: Bob sees the wrong organization';
  end if;
  if (select count(*) from public.organization_members) <> 1 then
    raise exception 'FAIL: tenant leak — Bob sees other organizations'' members';
  end if;
  raise notice 'PASS: organizations and members are isolated between tenants';
end $$;
commit;


-- Bob must not be able to add himself to Alice's organization.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
do $$
declare alice_org uuid;
begin
  select id into alice_org from public.organizations where name = 'Alice Clinic';
  -- Read as superuser-set variable: RLS hides it from Bob, so fetch it out of
  -- band to prove the write is blocked even when the id is known.
  if alice_org is not null then
    raise exception 'FAIL: Bob can read Alice''s organization row';
  end if;
  raise notice 'PASS: Bob cannot even read Alice''s organization id';
end $$;
commit;

-- Same attempt, but with the organization id supplied out of band. This is the
-- real threat model: a client that has somehow learned a valid id and puts it
-- in a request body. Fetched here as superuser, which bypasses RLS, so Bob's
-- statement receives an id he could never have read himself.
insert into public.test_ids (name, id)
select 'alice_org', id from public.organizations where name = 'Alice Clinic'
on conflict (name) do update set id = excluded.id;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
do $$
begin
  insert into public.organization_members (organization_id, user_id, role)
  values (
    (select id from public.test_ids where name = 'alice_org'),
    '22222222-2222-2222-2222-222222222222',
    'admin'
  );
  raise exception 'FAIL: Bob inserted himself into another organization';
exception
  when insufficient_privilege then
    raise notice 'PASS: a known-but-unauthorized org id cannot be written to';
end $$;
commit;


-- === Alice invites Bob as a doctor ========================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

insert into public.organization_members (organization_id, user_id, role, invited_by)
select id, '22222222-2222-2222-2222-222222222222', 'doctor', auth.uid()
from public.organizations where name = 'Alice Clinic';

do $$
begin
  if (select count(*) from public.user_profiles) <> 2 then
    raise exception
      'FAIL: expected Alice to see exactly 2 profiles (self + colleague), saw %',
      (select count(*) from public.user_profiles);
  end if;
  raise notice 'PASS: colleagues'' profiles become visible, Carol''s does not';
end $$;
commit;


-- A doctor is not an administrator.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
do $$
declare alice_org uuid;
begin
  select id into alice_org from public.organizations where name = 'Alice Clinic';
  if alice_org is null then
    raise exception 'FAIL: Bob should now see Alice Clinic as a member';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (alice_org, '33333333-3333-3333-3333-333333333333', 'doctor');
  raise exception 'FAIL: a doctor was able to add members';
exception
  when insufficient_privilege then
    raise notice 'PASS: doctor role cannot add members; admin/owner required';
end $$;
commit;


-- Bob now sees both organizations he belongs to, and only those.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
do $$
begin
  if (select count(*) from public.organizations) <> 2 then
    raise exception 'FAIL: expected Bob to see 2 organizations, saw %',
      (select count(*) from public.organizations);
  end if;
  raise notice 'PASS: multi-organization membership resolves correctly';
end $$;
commit;


-- === Last-owner protection ================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
do $$
begin
  update public.organization_members
     set role = 'doctor'
   where user_id = auth.uid() and role = 'owner';
  raise exception 'FAIL: the last owner was able to demote themselves';
exception
  when check_violation then
    raise notice 'PASS: the last active owner cannot be demoted';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
do $$
begin
  delete from public.organization_members
   where user_id = auth.uid() and role = 'owner';
  raise exception 'FAIL: the last owner was able to delete their membership';
exception
  when check_violation then
    raise notice 'PASS: the last active owner cannot be removed';
end $$;
commit;


-- === Audit log is append-only and admin-read-only ==========================
insert into public.audit_logs (organization_id, actor_user_id, action, metadata)
select id, '11111111-1111-1111-1111-111111111111', 'LOGIN', '{"result":"success"}'
from public.organizations where name = 'Alice Clinic';

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
do $$
begin
  if (select count(*) from public.audit_logs) <> 1 then
    raise exception 'FAIL: owner cannot read their organization''s audit log';
  end if;
  raise notice 'PASS: owner can read the audit log';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
do $$
begin
  if (select count(*) from public.audit_logs) <> 0 then
    raise exception 'FAIL: a doctor can read the audit log';
  end if;
  raise notice 'PASS: non-admin cannot read the audit log';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
do $$
begin
  insert into public.audit_logs (action) values ('FORGED');
  raise exception 'FAIL: a client was able to write an audit entry';
exception
  when insufficient_privilege then
    raise notice 'PASS: clients cannot write audit entries';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
do $$
begin
  update public.audit_logs set action = 'TAMPERED';
  raise exception 'FAIL: a client was able to modify an audit entry';
exception
  when insufficient_privilege then
    raise notice 'PASS: clients cannot modify audit entries';
end $$;
commit;

-- Even the service role, which the backend uses, cannot rewrite history.
begin;
set local role service_role;
do $$
begin
  update public.audit_logs set action = 'TAMPERED';
  raise exception 'FAIL: service_role was able to modify an audit entry';
exception
  when insufficient_privilege then
    raise notice 'PASS: service_role cannot modify audit entries';
end $$;
commit;


-- === anon has no access at all ============================================
begin;
set local role anon;
do $$
begin
  perform count(*) from public.organizations;
  raise exception 'FAIL: anon can query organizations';
exception
  when insufficient_privilege then
    raise notice 'PASS: anon has no access to organizations';
end $$;
commit;

begin;
set local role anon;
do $$
begin
  perform count(*) from public.user_profiles;
  raise exception 'FAIL: anon can query user_profiles';
exception
  when insufficient_privilege then
    raise notice 'PASS: anon has no access to user_profiles';
end $$;
commit;


-- === updated_at trigger ===================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
do $$
declare before_ts timestamptz; after_ts timestamptz;
begin
  select updated_at into before_ts from public.user_profiles where id = auth.uid();
  perform pg_sleep(0.01);
  update public.user_profiles set full_name = 'Alice Owner, MD' where id = auth.uid();
  select updated_at into after_ts from public.user_profiles where id = auth.uid();
  if after_ts <= before_ts then
    raise exception 'FAIL: updated_at was not advanced by the trigger';
  end if;
  raise notice 'PASS: updated_at is maintained by trigger, not the client';
end $$;
commit;

\echo 'ALL RLS TESTS PASSED'
