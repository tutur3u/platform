-- The runner derives this list from the active API schema configuration.
\if :{?security_exposed_schemas}
\else
\set security_exposed_schemas 'public,private,storage,graphql_public'
\endif
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);
select set_config('security.exposed_schemas', :'security_exposed_schemas', true);
create function pg_temp.security_definer_path_is_safe(path_setting text)
returns boolean
language plpgsql stable
set search_path = pg_catalog, pg_temp
as $path_check$
declare
  schemas text[];
  schema_name text;
  schema_oid oid;
  position integer;
begin
  if path_setting is null then return false; end if;
  if btrim(path_setting) in ('', '""') then return true; end if;
  schemas := regexp_split_to_array(path_setting, '\s*,\s*');
  for position in 1..cardinality(schemas) loop
    schema_name := btrim(schemas[position]);
    if schema_name ~ '^"([^".,]|"")*"$' then
      schema_name := replace(substr(schema_name, 2, length(schema_name) - 2), '""', '"');
    else
      schema_name := lower(schema_name);
    end if;
    schemas[position] := schema_name;
  end loop;
  if schemas = array['pg_catalog'] then return true; end if;
  if schemas[cardinality(schemas)] <> 'pg_temp' then return false; end if;
  for position in 1..cardinality(schemas) loop
    schema_name := schemas[position];
    if schema_name = 'pg_temp' then
      if position <> cardinality(schemas) then return false; end if;
      continue;
    end if;
    if schema_name = '$user' or schema_name = '' then return false; end if;
    select n.oid into schema_oid from pg_namespace n where n.nspname = schema_name;
    if schema_oid is null then return false; end if;
    if coalesce(has_schema_privilege(to_regrole('anon'), schema_oid, 'CREATE'), true)
      or coalesce(has_schema_privilege(to_regrole('authenticated'), schema_oid, 'CREATE'), true)
      or exists (
        select 1 from pg_namespace n,
          lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
        where n.oid = schema_oid and acl.grantee = 0 and acl.privilege_type = 'CREATE'
      ) then return false;
    end if;
  end loop;
  return true;
end;
$path_check$;

select is((
  select count(*)::integer from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = any(string_to_array(current_setting('security.exposed_schemas'), ','))
    and p.prosecdef and not pg_temp.security_definer_path_is_safe((
      select substr(setting, 13) from unnest(p.proconfig) setting
      where setting like 'search_path=%'
    ))
), 0, 'every exposed definer has a privilege-checked safe search path');
select ok(not has_schema_privilege('anon', 'public', 'CREATE')
  and not has_schema_privilege('authenticated', 'public', 'CREATE')
  and not exists (
    select 1 from pg_catalog.pg_namespace n,
      lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
    where n.nspname = 'public' and acl.grantee = 0 and acl.privilege_type = 'CREATE'
  ), 'public is trusted by effective privileges, including PUBLIC');

create function public.security_path_no_pin_fixture() returns integer
language sql security definer as $$select 1$$;
create function public.security_path_temp_first_fixture() returns integer
language sql security definer set search_path = pg_temp, public as $$select 1$$;
create function public.security_path_no_temp_fixture() returns integer
language sql security definer set search_path = public as $$select 1$$;
create schema security_path_writable_fixture;
grant create on schema security_path_writable_fixture to authenticated;
create function public.security_path_writable_fixture() returns integer
language sql security definer set search_path = security_path_writable_fixture, pg_temp as $$select 1$$;

select ok(not pg_temp.security_definer_path_is_safe((select substr(setting, 13)
  from pg_catalog.pg_proc p, lateral unnest(p.proconfig) setting
  where p.oid = 'public.security_path_no_pin_fixture()'::regprocedure and setting like 'search_path=%')),
  'negative control: inherited definer path is rejected');
select ok(not pg_temp.security_definer_path_is_safe((select substr(setting, 13)
  from pg_catalog.pg_proc p, lateral unnest(p.proconfig) setting
  where p.oid = 'public.security_path_temp_first_fixture()'::regprocedure and setting like 'search_path=%')),
  'negative control: pg_temp first is rejected');
select ok(not pg_temp.security_definer_path_is_safe((select substr(setting, 13)
  from pg_catalog.pg_proc p, lateral unnest(p.proconfig) setting
  where p.oid = 'public.security_path_no_temp_fixture()'::regprocedure and setting like 'search_path=%')),
  'negative control: implicit pg_temp is rejected');
select ok(has_schema_privilege('authenticated', 'security_path_writable_fixture', 'CREATE')
  and not pg_temp.security_definer_path_is_safe((select substr(setting, 13)
    from pg_catalog.pg_proc p, lateral unnest(p.proconfig) setting
    where p.oid = 'public.security_path_writable_fixture()'::regprocedure and setting like 'search_path=%')),
  'negative control: writable schema is rejected even with pg_temp last');
select is((
  select count(*)::integer from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = any(string_to_array(current_setting('security.exposed_schemas'), ','))
    and p.prosecdef and not pg_temp.security_definer_path_is_safe((
      select substr(setting, 13) from unnest(p.proconfig) setting
      where setting like 'search_path=%'
    ))
), 4, 'all four unsafe definer controls fail the catalog verifier');
select ok(not pg_temp.security_definer_path_is_safe('security_path_missing_fixture, pg_temp'),
  'negative control: nonexistent schema is rejected');
select ok(not pg_temp.security_definer_path_is_safe('"$user", public, pg_temp'),
  'negative control: user-dependent schema is rejected');
select ok(pg_temp.security_definer_path_is_safe('""'), 'empty path is safe');
select ok(pg_temp.security_definer_path_is_safe('pg_catalog'), 'catalog-only path is safe');
select ok(pg_temp.security_definer_path_is_safe('public, pg_temp'),
  'a trusted schema with pg_temp last is safe');
revoke create on schema security_path_writable_fixture from authenticated;
select ok(pg_temp.security_definer_path_is_safe('security_path_writable_fixture, pg_temp'),
  'trust follows current effective privileges rather than schema names');
grant create on schema security_path_writable_fixture to anon;
select ok(not pg_temp.security_definer_path_is_safe('security_path_writable_fixture, pg_temp'),
  'anon CREATE also makes a schema untrusted');
revoke create on schema security_path_writable_fixture from anon;
grant create on schema security_path_writable_fixture to public;
select ok(not pg_temp.security_definer_path_is_safe('security_path_writable_fixture, pg_temp'),
  'PUBLIC CREATE also makes a schema untrusted');

-- Both qualified trigger bodies remain live through their normal table writes.
insert into public.users(id) values
  ('00000000-0000-4000-8000-00000000a301'), ('00000000-0000-4000-8000-00000000a302');
insert into public.workspaces(id, name, personal, creator_id)
values ('00000000-0000-4000-8000-00000000a311', 'Safe path contract', false,
  '00000000-0000-4000-8000-00000000a301');
select is((select count(*)::integer from public.workspace_members
  where ws_id = '00000000-0000-4000-8000-00000000a311'
    and user_id = '00000000-0000-4000-8000-00000000a301'), 1,
  'empty-path workspace creator trigger adds its member');
delete from public.workspace_members where ws_id = '00000000-0000-4000-8000-00000000a311';
insert into public.workspace_members(ws_id, user_id)
values ('00000000-0000-4000-8000-00000000a311', '00000000-0000-4000-8000-00000000a302');
select is((select creator_id from public.workspaces where id = '00000000-0000-4000-8000-00000000a311'),
  '00000000-0000-4000-8000-00000000a302'::uuid,
  'empty-path sole-member trigger claims the workspace');
set local role authenticated;
select ok(public.is_task_sharing_enabled('00000000-0000-4000-8000-00000000a3ff')
  and not public.is_member_invited('00000000-0000-4000-8000-00000000a3ff', '00000000-0000-4000-8000-00000000a3ff'),
  'authenticated callers retain both policy helpers under trusted paths');
reset role;
select * from finish();
rollback;
