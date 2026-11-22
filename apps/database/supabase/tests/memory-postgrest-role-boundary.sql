begin;
create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, extensions;
select plan(9);

select lives_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'the managed role and schema graph satisfies the apply-time guard');

create role memory_fixture_login login;
create role memory_fixture_set nologin;
create role memory_fixture_definer nologin;
grant memory_fixture_set to memory_fixture_login with inherit false, set true;
grant usage on schema public to memory_fixture_set, memory_fixture_definer;
create schema memory_fixture_owned;
create function memory_fixture_owned.example() returns integer
language sql security definer set search_path = pg_catalog, pg_temp as $$ select 1 $$;
grant memory_fixture_definer to postgres with inherit false, set true;
grant create on schema memory_fixture_owned to memory_fixture_definer;
alter function memory_fixture_owned.example() owner to memory_fixture_definer;
create temporary table memory_fixture_roles as select memory_gateway.public_role_access() as roles;

select ok('memory_fixture_set'::regrole::oid = any(roles),
  'a NOLOGIN role reachable by SET is captured') from memory_fixture_roles;
select ok('memory_fixture_definer'::regrole::oid = any(roles),
  'a definer owner with public access is captured') from memory_fixture_roles;
revoke usage on schema public from memory_fixture_set, memory_fixture_definer;
select throws_ok('select memory_gateway.assert_role_boundary(roles) from pg_temp.memory_fixture_roles',
  'P0001', 'Existing roles would lose public schema access', 'apply fails if an execution context loses public lookup');

grant memory_rpc to memory_fixture_login with inherit false, set true;
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory role membership', 'apply fails on an unexpected SET authority');
revoke memory_rpc from memory_fixture_login;

grant usage on schema memory_storage to memory_rpc;
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory schema access', 'apply fails on a storage schema grant');
revoke usage on schema memory_storage from memory_rpc;

grant usage on schema public to public;
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory schema access', 'apply fails if PUBLIC gives memory access to public');
revoke usage on schema public from public;

alter role authenticator set pgrst.db_schemas = 'public,net';
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory schema access', 'apply fails if the catalog exposes net');
alter role authenticator reset pgrst.db_schemas;

set local role memory_rpc_owner;
grant execute on function memory_api.reserve(uuid, text, text[]) to authenticated;
reset role;
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory object access', 'apply fails if ordinary roles can reserve');

select * from finish();
rollback;
