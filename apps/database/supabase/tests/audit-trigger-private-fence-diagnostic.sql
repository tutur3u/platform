begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

create temporary table audit_probe (phase text primary key, baseline bigint);
insert into audit_probe
select 'main', count(*)
from audit.record_version
where table_schema = 'public' and table_name = 'users'
  and op = 'UPDATE'::audit.operation;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
do $main_update$
begin
  update public.users
  set bio = 'Private fence audit on main'
  where id = '00000000-0000-0000-0000-000000000005';
  if not found then
    raise exception 'Authenticated update did not reach seeded public.users row';
  end if;
end;
$main_update$;
reset role;

select diag(coalesce((
  select format('MAIN auth_uid=%s jwt_uid=%s record=%s',
    coalesce(auth_uid::text, 'NULL'),
    '00000000-0000-0000-0000-000000000005',
    record::text)
  from audit.record_version
  where table_schema = 'public' and table_name = 'users'
    and op = 'UPDATE'::audit.operation
  order by id desc limit 1
), 'MAIN audit row absent'));

select ok(
  (select count(*) from audit.record_version r
   where r.table_schema = 'public' and r.table_name = 'users'
     and r.op = 'UPDATE'::audit.operation) >
  (select baseline from audit_probe where phase = 'main'),
  'authenticated UPDATE writes an audit row on main'
);

do $definers$
declare fn record; service_access boolean;
begin
  for fn in
    select p.oid from pg_proc p
    where p.pronamespace = to_regnamespace('audit')
      and p.prokind = 'f' and p.prosecdef
  loop
    service_access := has_function_privilege('service_role', fn.oid, 'EXECUTE');
    execute format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.oid::regprocedure);
    if has_function_privilege('anon', fn.oid, 'EXECUTE')
      or has_function_privilege('authenticated', fn.oid, 'EXECUTE') then
      raise exception 'Cannot restrict audit function %', fn.oid::regprocedure;
    end if;
    if service_access and not has_function_privilege('service_role', fn.oid, 'EXECUTE') then
      execute format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.oid::regprocedure);
    end if;
  end loop;
end;
$definers$;

do $audit$
declare creator record; object_type text;
begin
  if to_regnamespace('audit') is not null then
    revoke all on all tables in schema audit from anon, authenticated;
    revoke all on all sequences in schema audit from anon, authenticated;
    for creator in
      select pg_get_userbyid(owner_oid) as name from (
        select nspowner as owner_oid from pg_namespace where nspname = 'audit'
        union select p.proowner from pg_proc p where p.pronamespace = to_regnamespace('audit')
        union select c.relowner from pg_class c where c.relnamespace = to_regnamespace('audit')
        union select d.defaclrole from pg_default_acl d where d.defaclnamespace = to_regnamespace('audit')
      ) owners
    loop
      foreach object_type in array array['TABLES', 'SEQUENCES', 'FUNCTIONS'] loop
        execute format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA audit REVOKE ALL ON %s FROM anon, authenticated', creator.name, object_type);
      end loop;
    end loop;
  else
    raise notice 'Skipping absent schema audit';
  end if;
  if to_regnamespace('audit') is not null then
    revoke usage on schema audit from anon, authenticated;
    if has_schema_privilege('anon', 'audit', 'USAGE')
      or has_schema_privilege('authenticated', 'audit', 'USAGE') then
      raise exception 'Audit schema still permits client access';
    end if;
  end if;
end;
$audit$;

do $legacy$
declare fn oid; service_access boolean; authenticated_access boolean;
begin
  fn := to_regprocedure('public.validate_cross_app_token(text,text)');
  if fn is null then
    raise notice 'Skipping absent legacy cross-app validator';
    return;
  end if;
  service_access := has_function_privilege('service_role', fn, 'EXECUTE');
  authenticated_access := has_function_privilege('authenticated', fn, 'EXECUTE');
  execute format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn::regprocedure);
  if service_access and not has_function_privilege('service_role', fn, 'EXECUTE') then
    execute format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn::regprocedure);
  end if;
  if authenticated_access and not has_function_privilege('authenticated', fn, 'EXECUTE') then
    execute format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn::regprocedure);
  end if;
  if has_function_privilege('anon', fn, 'EXECUTE') then
    raise exception 'Legacy cross-app validator still permits anon execution';
  end if;
end;
$legacy$;

insert into audit_probe
select 'd1', count(*)
from audit.record_version
where table_schema = 'public' and table_name = 'users'
  and op = 'UPDATE'::audit.operation;

set local role authenticated;
do $d1_update$
begin
  update public.users
  set bio = 'Private fence audit after D1'
  where id = '00000000-0000-0000-0000-000000000005';
  if not found then
    raise exception 'Authenticated update did not reach seeded public.users row after D1';
  end if;
end;
$d1_update$;
reset role;

select diag(coalesce((
  select format('D1 auth_uid=%s jwt_uid=%s record=%s',
    coalesce(auth_uid::text, 'NULL'),
    '00000000-0000-0000-0000-000000000005',
    record::text)
  from audit.record_version
  where table_schema = 'public' and table_name = 'users'
    and op = 'UPDATE'::audit.operation
  order by id desc limit 1
), 'D1 audit row absent'));

select ok(
  (select count(*) from audit.record_version r
   where r.table_schema = 'public' and r.table_name = 'users'
     and r.op = 'UPDATE'::audit.operation) >
  (select baseline from audit_probe where phase = 'd1'),
  'authenticated UPDATE writes an audit row after D1'
);

select * from finish();
rollback;
