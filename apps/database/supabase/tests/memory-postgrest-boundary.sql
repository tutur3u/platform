begin;
create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, extensions;
select plan(20);

select ok(not rolcanlogin and not rolinherit and not rolbypassrls and not rolsuper,
  'memory API role has no interactive login, inheritance or RLS bypass')
from pg_roles where rolname = 'memory_rpc';
select is(
  (select count(*) from pg_auth_members where member = 'memory_rpc'::regrole),
  0::bigint, 'memory API role is not a member of any other role'
);
select ok(not has_schema_privilege('memory_rpc', 'public', 'USAGE'),
  'memory API role has no public schema lookup');
select ok(not has_schema_privilege('memory_rpc', 'memory_storage', 'USAGE'),
  'memory API role cannot look up storage tables');
select ok(not has_table_privilege('memory_rpc', 'memory_storage.memories', 'SELECT, INSERT, UPDATE, DELETE'),
  'memory API role has no direct table privileges');
select ok(not has_sequence_privilege('memory_rpc', 'memory_storage.assistant_fence', 'SELECT, USAGE, UPDATE'),
  'memory API role cannot access the reservation fence sequence');
select ok(not has_schema_privilege('memory_rpc', 'memory_api', 'CREATE'),
  'memory API role cannot create exposed objects');
select ok(has_schema_privilege('memory_rpc', 'memory_api', 'USAGE'),
  'memory API role can look up allowlisted RPCs');
select ok(not exists (
  select 1 from pg_class where relnamespace = 'memory_api'::regnamespace
), 'the exposed memory schema has no relations');
select is(
  (select array_agg(p.proname::text order by p.proname)
  from pg_proc p where p.pronamespace = 'memory_api'::regnamespace
    and has_function_privilege('memory_rpc', p.oid, 'EXECUTE')),
  array['execute', 'reserve'],
  'exactly two typed RPCs are executable'
);
select ok(not exists (
  select 1 from pg_proc p, unnest(array['anon', 'authenticated', 'service_role']) as role_name
  where p.pronamespace = 'memory_api'::regnamespace
    and has_function_privilege(role_name, p.oid, 'EXECUTE')
), 'ordinary API roles have no memory RPC execute privilege');
select ok(not exists (
  select 1 from pg_proc p where p.pronamespace = 'memory_api'::regnamespace
    and (not p.prosecdef or p.proowner <> 'memory_rpc_owner'::regrole
      or p.proconfig is distinct from array['search_path=pg_catalog, pg_temp'])
), 'all API routines have the constrained owner and pinned path');
select ok(not has_schema_privilege('memory_rpc_owner', 'memory_storage', 'CREATE')
  and not has_schema_privilege('memory_rpc_owner', 'memory_api', 'CREATE'),
  'RPC owner cannot create storage or exposed objects');
select ok(not has_column_privilege('memory_rpc_owner', 'memory_storage.admission', 'stopped', 'UPDATE')
  and not has_column_privilege('memory_rpc_owner', 'memory_storage.admission', 'epoch', 'UPDATE'),
  'RPC owner cannot reopen or advance the epoch stop');
select is((select count(*) from memory_storage.admission where stopped and epoch = 0 and remaining = 0),
  2::bigint, 'both cohorts start stopped with no budget');
select is((select count(*) from memory_storage.memories), 0::bigint,
  'memory storage starts empty');

select ok(has_function_privilege('supabase_auth_admin', 'memory_gateway.access_token(jsonb)', 'EXECUTE')
  and not has_function_privilege('memory_rpc', 'memory_gateway.access_token(jsonb)', 'EXECUTE'),
  'only the Auth service can call the machine-claim hook');
select is(memory_gateway.access_token('{"user_id":"00000000-0000-4000-8000-000000000001","claims":{"role":"authenticated","aal":"aal1"}}'),
  '{"claims":{"role":"authenticated","aal":"aal1"}}'::jsonb,
  'the optional token hook preserves ordinary claims');
select ok(exists (
  select 1 from pg_roles where rolname = 'authenticator'
  and 'pgrst.db_pre_request=memory_gateway.check_request' = any(rolconfig)
), 'PostgREST invokes the unexposed dispatcher');

set local role anon;
select set_config('request.method', 'GET', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok('select memory_gateway.check_request()', 'anonymous requests still traverse the existing account hook');
reset role;

select * from finish();
rollback;
