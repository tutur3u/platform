begin;
create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, extensions;
select plan(6);

select ok(not exists (
  select from pg_namespace n, lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
  where n.nspname = 'memory_gateway' and a.grantee <> n.nspowner
), 'memory_gateway schema starts private to postgres');

select ok(not exists (
  select from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.pronamespace = 'memory_gateway'::regnamespace and a.grantee <> p.proowner
), 'memory_gateway verifier functions start private to postgres');

select ok(
  'anon'::regrole::oid = any(memory_gateway.public_role_access())
  and 'authenticated'::regrole::oid = any(memory_gateway.public_role_access())
  and 'service_role'::regrole::oid = any(memory_gateway.public_role_access()),
  'public_role_access captures ordinary roles with public schema lookup'
);

select ok(
  memory_gateway.ordinary_hook_access('anon'::regrole)
  and memory_gateway.ordinary_hook_access('authenticated'::regrole)
  and memory_gateway.ordinary_hook_access('service_role'::regrole),
  'ordinary_hook_access reflects public.check_account_request reachability'
);

create role memory_fixture_acl nologin;
create role memory_fixture_platform_reader nologin;
grant memory_fixture_platform_reader to memory_fixture_acl with inherit true, set false;
select throws_ok(
  $$select memory_gateway.assert_reader_memberships(array['memory_fixture_platform_reader'::regrole::oid])$$,
  'P0001', 'Unexpected platform reader membership', 'inherited reader authority is denied to custom roles'
);
revoke memory_fixture_platform_reader from memory_fixture_acl;
grant memory_fixture_platform_reader to memory_fixture_acl with inherit false, set true;
select throws_ok(
  $$select memory_gateway.assert_reader_memberships(array['memory_fixture_platform_reader'::regrole::oid])$$,
  'P0001', 'Unexpected platform reader membership', 'SET reader authority is denied to custom roles'
);

select * from finish();
rollback;
