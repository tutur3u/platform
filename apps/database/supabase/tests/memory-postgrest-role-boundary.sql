begin;
create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, extensions;
select plan(18);

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
set local role memory_rpc_owner;
revoke execute on function memory_api.reserve(uuid, text, text[]) from authenticated;
reset role;

create function pg_temp.membership_detail() returns text
language plpgsql as $$
declare
  detail text;
begin
  perform memory_gateway.assert_role_boundary(memory_gateway.public_role_access());
  return null;
exception when raise_exception then
  get stacked diagnostics detail = pg_exception_detail;
  return detail;
end
$$;

-- Hosted privileged-role creation can give postgres SET and INHERIT on the roles it creates.
grant memory_rpc to postgres with inherit true, set true;
select lives_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'a postgres membership with any options is accepted');

-- A role that can SET postgres already owns the memory objects. Only a superuser runner can build it.
create role memory_fixture_operator nologin;
do $$
begin
  if pg_has_role(current_user, 'postgres', 'MEMBER WITH ADMIN OPTION') then
    grant postgres to memory_fixture_operator with inherit false, set true;
    grant memory_rpc_owner to memory_fixture_operator with inherit false, set true;
  end if;
end
$$;
select case when pg_has_role(current_user, 'postgres', 'MEMBER WITH ADMIN OPTION')
  then lives_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
    'a member of postgres may hold the owner role')
  else skip('the non-superuser runner cannot grant postgres membership', 1) end;

-- Inheriting the owner through a postgres-equivalent does not make the heir postgres-equivalent.
create role memory_fixture_heir nologin;
do $$
begin
  if pg_has_role(current_user, 'postgres', 'MEMBER WITH ADMIN OPTION') then
    grant memory_rpc_owner to memory_fixture_operator with inherit true;
    grant memory_fixture_operator to memory_fixture_heir with inherit true, set false;
  end if;
end
$$;
select case when pg_has_role(current_user, 'postgres', 'MEMBER WITH ADMIN OPTION')
  then throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
    'P0001', 'Unexpected memory role membership', 'a role inheriting the owner through a postgres member is refused')
  else skip('the non-superuser runner cannot grant postgres membership', 1) end;
revoke memory_fixture_operator from memory_fixture_heir;

grant memory_rpc_owner to memory_fixture_set with inherit false, set true;
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory role membership', 'an unrelated owner membership is refused');
select ok(pg_temp.membership_detail() like '%memory_fixture_login can set or inherit memory_rpc_owner%'
  and pg_temp.membership_detail() like '%memory_fixture_set member of memory_rpc_owner (admin=false, inherit=false, set=true)%',
  'the refusal names each offending role and its options');
revoke memory_rpc_owner from memory_fixture_set;

grant memory_rpc to authenticator with admin true;
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory role membership', 'authenticator cannot administer the memory role');
revoke admin option for memory_rpc from authenticator;

grant memory_fixture_definer to memory_rpc with inherit false, set true;
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory role membership', 'a memory role cannot become a member of another role');
revoke memory_fixture_definer from memory_rpc;

-- Only installed managed extension schemas may keep PUBLIC usage.
create schema memory_fixture_open;
grant usage on schema memory_fixture_open to public;
select throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
  'P0001', 'Unexpected memory schema access', 'PUBLIC usage on an ordinary schema is refused');
revoke usage on schema memory_fixture_open from public;
do $$
begin
  if pg_has_role(current_user, 'postgres', 'MEMBER WITH ADMIN OPTION')
    and not exists (select from pg_namespace where nspname = 'pgsodium') then
    create schema pgsodium authorization supabase_admin;
    grant usage on schema pgsodium to public;
  end if;
end
$$;
select case when exists (select from pg_namespace where nspname = 'pgsodium')
    and not exists (select from pg_extension where extname = 'pgsodium')
  then throws_ok('select memory_gateway.assert_role_boundary(memory_gateway.public_role_access())',
    'P0001', 'Unexpected memory schema access', 'a pgsodium-named schema without its extension is refused')
  else skip('requires a superuser runner without the pgsodium extension', 1) end;

select * from finish();
rollback;
