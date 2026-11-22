begin;
create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, extensions;
select plan(15);

select lives_ok('select memory_gateway.assert_default_acl()', 'expected creator defaults pass');
select lives_ok('select memory_gateway.assert_effective_acl()', 'the scoped effective grants pass');
select lives_ok('select memory_gateway.assert_account_hook_acl()', 'ordinary account-hook reachability is unchanged');

alter default privileges for role postgres grant update on tables to public;
select throws_ok('select memory_gateway.assert_default_acl()',
  'P0001', 'Unexpected memory default ACL', 'global PUBLIC table privileges fail apply');
create table memory_storage.fixture_default_exposure (value integer);
select throws_ok('select memory_gateway.assert_effective_acl()',
  'P0001', 'Unexpected effective memory privilege', 'materialized PUBLIC table permissions fail apply');
drop table memory_storage.fixture_default_exposure;
alter default privileges for role postgres revoke update on tables from public;

create role memory_fixture_acl nologin;
alter default privileges for role postgres in schema memory_storage grant select on tables to memory_fixture_acl;
select throws_ok('select memory_gateway.assert_default_acl()',
  'P0001', 'Unexpected memory default ACL', 'a separate NOLOGIN role cannot get a memory default grant');
alter default privileges for role postgres in schema memory_storage revoke select on tables from memory_fixture_acl;

grant update (stopped, epoch) on memory_storage.admission to memory_rpc_owner;
select throws_ok('select memory_gateway.assert_effective_acl()',
  'P0001', 'Unexpected effective memory privilege', 'the RPC owner cannot update the epoch or stop fence');
revoke update (stopped, epoch) on memory_storage.admission from memory_rpc_owner;

grant update on sequence memory_storage.assistant_fence to memory_fixture_acl;
select throws_ok('select memory_gateway.assert_effective_acl()',
  'P0001', 'Unexpected effective memory privilege', 'a separate role cannot alter a memory sequence');
revoke update on sequence memory_storage.assistant_fence from memory_fixture_acl;

grant execute on function memory_storage.last_fence(text) to memory_fixture_acl;
select throws_ok('select memory_gateway.assert_effective_acl()',
  'P0001', 'Unexpected effective memory privilege', 'a separate role cannot call a storage routine');
revoke execute on function memory_storage.last_fence(text) from memory_fixture_acl;

grant usage on schema public to memory_fixture_acl;
grant execute on function public.check_account_request() to memory_fixture_acl;
select throws_ok('select memory_gateway.assert_account_hook_acl()',
  'P0001', 'Memory dispatcher would change account hook access', 'a missing independent grant fails closed');

select ok(has_schema_privilege('pg_read_all_data', 'memory_storage', 'USAGE')
  and has_table_privilege('pg_read_all_data', 'memory_storage.memories', 'SELECT')
  and not has_table_privilege('pg_read_all_data', 'memory_storage.memories', 'INSERT, UPDATE, DELETE, TRUNCATE')
  and not has_function_privilege('pg_read_all_data', 'memory_api.reserve(uuid,text,text[])', 'EXECUTE'),
  'the platform reader has its inherent reads and no write or RPC rights');
grant execute on function memory_storage.last_fence(text) to pg_read_all_data;
select throws_ok('select memory_gateway.assert_effective_acl()',
  'P0001', 'Unexpected effective memory privilege', 'managed reader routine expansion fails');
revoke execute on function memory_storage.last_fence(text) from pg_read_all_data;
grant select on memory_storage.memories to pg_read_all_data;
select throws_ok('select memory_gateway.assert_effective_acl()',
  'P0001', 'Unexpected effective memory privilege', 'an explicit platform grant fails even if redundant');
revoke select on memory_storage.memories from pg_read_all_data;

create role memory_fixture_platform_reader nologin;
grant memory_fixture_platform_reader to memory_fixture_acl with inherit true, set false;
select throws_ok(
  $$select memory_gateway.assert_reader_memberships(array['memory_fixture_platform_reader'::regrole::oid])$$,
  'P0001', 'Unexpected platform reader membership', 'inherited reader authority is denied to custom roles');
revoke memory_fixture_platform_reader from memory_fixture_acl;
grant memory_fixture_platform_reader to memory_fixture_acl with inherit false, set true;
select throws_ok(
  $$select memory_gateway.assert_reader_memberships(array['memory_fixture_platform_reader'::regrole::oid])$$,
  'P0001', 'Unexpected platform reader membership', 'SET reader authority is denied to custom roles');

select * from finish();
rollback;
