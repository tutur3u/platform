-- Catalog dependencies include functions in both USING and WITH CHECK.
-- Provider-managed tables remain outside application migration custody.
\if :{?security_exposed_schemas}
\else
\set security_exposed_schemas 'public,private,storage,graphql_public'
\endif
\if :{?security_migration_role}
\else
\set security_migration_role 'postgres'
\endif
begin;
set local role :"security_migration_role";
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);
select set_config('security.exposed_schemas', :'security_exposed_schemas', true);
create temp view security_policy_execute_failures as
select distinct pol.polrelid::regclass as relation, pol.polname,
  p.oid::regprocedure as function, r.role_oid
from pg_policy pol
join pg_depend d on d.classid='pg_policy'::regclass and d.objid=pol.oid
  and d.refclassid='pg_proc'::regclass
join pg_proc p on p.oid=d.refobjid
join pg_class c on c.oid=pol.polrelid
join pg_namespace n on n.oid=c.relnamespace
cross join lateral unnest(pol.polroles) r(role_oid)
where n.nspname=any(string_to_array(current_setting('security.exposed_schemas'),','))
  and n.nspname not in ('storage','graphql_public')
  and pg_has_role(current_user,c.relowner,'USAGE')
  and not exists(select 1 from pg_depend e where e.classid='pg_class'::regclass
    and e.objid=c.oid and e.deptype='e')
  and not case when r.role_oid=0 then exists(
    select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE'
  ) else has_function_privilege(r.role_oid,p.oid,'EXECUTE') end;
select * from security_policy_execute_failures;
select is((select count(*)::integer from security_policy_execute_failures),0,
  'every application RLS function is executable by every policy role');

create function public.security_policy_execute_fixture() returns boolean
language sql security invoker set search_path=pg_catalog,pg_temp as $$select true$$;
revoke all on function public.security_policy_execute_fixture() from public,anon,authenticated;
create table public.security_policy_execute_fixture(id integer);
insert into public.security_policy_execute_fixture values(1);
alter table public.security_policy_execute_fixture enable row level security;
grant select on public.security_policy_execute_fixture to authenticated;
create policy security_policy_execute_fixture on public.security_policy_execute_fixture
  for select to authenticated using(public.security_policy_execute_fixture());
select is((select count(*)::integer from security_policy_execute_failures),1,
  'negative control: missing policy-role EXECUTE fails the catalog assertion');
set local role authenticated;
select throws_ok('select * from public.security_policy_execute_fixture','42501',null,
  'negative control: authenticated SELECT reaches the missing function privilege');
reset role;
set local role :"security_migration_role";
grant execute on function public.security_policy_execute_fixture() to authenticated;
select is((select count(*)::integer from security_policy_execute_failures),0,
  'granting the required role repairs the catalog assertion');
set local role authenticated;
select is((select count(*)::integer from public.security_policy_execute_fixture),1,
  'authenticated SELECT works once policy prerequisites are healthy');
reset role;
set local role :"security_migration_role";
alter policy security_policy_execute_fixture on public.security_policy_execute_fixture to public;
select is((select count(*)::integer from security_policy_execute_failures),1,
  'negative control: PUBLIC policy requires PUBLIC EXECUTE, not one named role');
grant execute on function public.security_policy_execute_fixture() to public;
select is((select count(*)::integer from security_policy_execute_failures),0,
  'PUBLIC EXECUTE repairs the PUBLIC policy dependency');
select ok(exists(select 1 from pg_depend d join pg_policy pol on pol.oid=d.objid
  where d.classid='pg_policy'::regclass and d.refclassid='pg_proc'::regclass
    and d.refobjid='public.security_policy_execute_fixture()'::regprocedure
    and pol.polrelid='public.security_policy_execute_fixture'::regclass),
  'negative controls exercised a real parsed RLS dependency');
select * from finish();
rollback;
