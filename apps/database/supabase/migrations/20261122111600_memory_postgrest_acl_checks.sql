-- tuturuuu: no-grant (internal)
begin;
create schema memory_gateway;
revoke all on schema memory_gateway from public, anon, authenticated, service_role;

create function memory_gateway.public_role_access() returns oid[]
language sql stable set search_path = pg_catalog, pg_temp as $$
  select array(select r.oid from pg_roles r
    where r.rolname not in ('memory_rpc', 'memory_rpc_owner')
      and has_schema_privilege(r.oid, 'public', 'USAGE')
      and (r.rolcanlogin
        or exists (select from pg_roles l where l.rolcanlogin and not l.rolsuper and pg_has_role(l.oid, r.oid, 'SET'))
        or exists (select from pg_proc p where p.proowner = r.oid and p.prosecdef)
        or exists (select from pg_class c where c.relowner = r.oid and c.relkind in ('v', 'm'))
        or exists (select from pg_trigger t join pg_proc p on p.oid = t.tgfoid where p.proowner = r.oid and not t.tgisinternal))
    order by r.oid)
$$;
revoke all on function memory_gateway.public_role_access() from public, anon, authenticated, service_role;

create function memory_gateway.assert_default_acl() returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if exists (
    select from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where a.grantee <> d.defaclrole and (
      d.defaclnamespace in ('memory_storage'::regnamespace, 'memory_api'::regnamespace, 'memory_gateway'::regnamespace)
      or (d.defaclnamespace = 0 and d.defaclrole in ('postgres'::regrole, 'memory_rpc_owner'::regrole)
        and d.defaclobjtype in ('r', 'S', 'f')
        and not (d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'
          and a.grantee in ('authenticated'::regrole, 'service_role'::regrole)
          and a.privilege_type = 'EXECUTE' and not a.is_grantable))
    )
  ) or exists (
    select from pg_roles r, lateral aclexplode(coalesce((
      select d.defaclacl from pg_default_acl d
      where d.defaclrole = r.oid and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
    ), acldefault('f', r.oid))) a
    where r.rolname in ('postgres', 'memory_rpc_owner') and a.grantee = 0
  ) then
    raise exception 'Unexpected memory default ACL';
  end if;
end
$$;
revoke all on function memory_gateway.assert_default_acl() from public, anon, authenticated, service_role;

create function memory_gateway.ordinary_hook_access(role_id oid) returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select has_schema_privilege(role_id, 'public', 'USAGE')
    and has_function_privilege(role_id, 'public.check_account_request()', 'EXECUTE')
$$;
revoke all on function memory_gateway.ordinary_hook_access(oid) from public, anon, authenticated, service_role;

create function memory_gateway.assert_account_hook_acl() returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  role_name name;
begin
  select r.rolname into role_name from pg_roles r
  where not r.rolsuper and r.rolname not in (
    'memory_rpc', 'memory_rpc_owner', 'pg_read_all_data', 'supabase_read_only_user', 'supabase_etl_admin'
  )
    and memory_gateway.ordinary_hook_access(r.oid)
    is distinct from (has_schema_privilege(r.oid, 'memory_gateway', 'USAGE')
      and has_function_privilege(r.oid, 'memory_gateway.check_request()', 'EXECUTE'))
  limit 1;
  if found then
    raise exception 'Memory dispatcher would change account hook access'
      using detail = format('Role %I has different old-hook and dispatcher access', role_name);
  end if;
end
$$;
revoke all on function memory_gateway.assert_account_hook_acl() from public, anon, authenticated, service_role;

create function memory_gateway.assert_reader_memberships(platform_roles oid[]) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  member_name name;
begin
  select r.rolname into member_name
  from pg_roles r, unnest(platform_roles) as platform(role_id)
  where not r.rolsuper and r.rolname <> 'postgres' and not (r.oid = any(platform_roles))
    and (pg_has_role(r.oid, platform.role_id, 'USAGE') or pg_has_role(r.oid, platform.role_id, 'SET'))
  limit 1;
  if found then
    raise exception 'Unexpected platform reader membership' using detail = format('Role %I can use a platform reader', member_name);
  end if;
end
$$;
revoke all on function memory_gateway.assert_reader_memberships(oid[]) from public, anon, authenticated, service_role;

create function memory_gateway.assert_effective_acl() returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  deviation record;
begin
  -- Supabase's dashboard read-only and ETL roles inherit PostgreSQL-wide SELECT and schema USAGE.
  -- https://supabase.com/docs/guides/platform/access-control
  perform memory_gateway.assert_reader_memberships(array(
    select oid from pg_roles where rolname in ('pg_read_all_data', 'supabase_read_only_user', 'supabase_etl_admin')
  ));
  if exists (
    select from pg_namespace n where n.nspname in ('memory_storage', 'memory_api', 'memory_gateway')
      and n.nspowner <> 'postgres'::regrole
  ) or exists (
    select from pg_class c where c.relnamespace in (
      'memory_storage'::regnamespace, 'memory_api'::regnamespace, 'memory_gateway'::regnamespace
    ) and c.relowner <> 'postgres'::regrole
  ) or exists (
    select from pg_proc p where p.pronamespace in (
      'memory_storage'::regnamespace, 'memory_api'::regnamespace, 'memory_gateway'::regnamespace
    ) and p.proowner <> case
      when p.oid in ('memory_api.reserve(uuid,text,text[])'::regprocedure, 'memory_api.execute(uuid,text,text[],jsonb)'::regprocedure)
        then 'memory_rpc_owner'::regrole else 'postgres'::regrole end
  ) then
    raise exception 'Unexpected memory object owner';
  end if;
  with roles as materialized (
    select r.oid, r.rolname,
      r.rolname in ('pg_read_all_data', 'supabase_read_only_user', 'supabase_etl_admin') as platform_role,
      r.rolname in ('pg_read_all_data', 'supabase_read_only_user', 'supabase_etl_admin')
        and pg_has_role(r.oid, 'pg_read_all_data', 'USAGE') as platform_read
    from pg_roles r
    where not r.rolsuper and r.rolname <> 'postgres'
      and (
        r.rolname !~ '^pg_' or r.rolname = 'pg_read_all_data'
        or exists (select from pg_roles l where l.rolcanlogin and not l.rolsuper
          and l.rolname <> 'postgres' and pg_has_role(l.oid, r.oid, 'SET'))
        or exists (select from pg_proc p where p.proowner = r.oid and p.prosecdef)
        or exists (select from pg_class c where c.relowner = r.oid and c.relkind in ('v', 'm'))
        or exists (select from pg_trigger t join pg_proc p on p.oid = t.tgfoid
          where p.proowner = r.oid and not t.tgisinternal)
      )
  ), scope as materialized (
    select oid, nspname from pg_namespace where nspname in ('memory_storage', 'memory_api', 'memory_gateway')
  ), relations as materialized (
    select c.oid, c.relname, c.relkind, s.nspname from pg_class c join scope s on s.oid = c.relnamespace
    where c.relkind in ('r', 'f', 'p', 'v', 'm', 'S')
  ), table_permissions as materialized (
    select r.oid as role_id, r.rolname, t.oid as table_id, t.relname, t.nspname, access.privilege,
      case
        when r.platform_role then r.platform_read and access.privilege = 'SELECT'
        when t.nspname <> 'memory_storage' then false
        when r.rolname = 'supabase_auth_admin' then t.relname = 'principals' and access.privilege = 'SELECT'
        when r.rolname <> 'memory_rpc_owner' then false
        when t.relname = 'memories' then access.privilege in ('SELECT', 'INSERT', 'DELETE')
        when t.relname in ('principals', 'admission') then access.privilege = 'SELECT'
        when t.relname in ('retired_ids', 'retired_tags', 'reservation_ids', 'purge_receipts') then
          access.privilege in ('SELECT', 'INSERT')
        else false
      end as allowed
    from roles r cross join relations t
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
      || case when current_setting('server_version_num')::integer >= 170000 then array['MAINTAIN'] else array[]::text[] end
    ) as access(privilege)
    where t.relkind <> 'S'
  ), column_permissions as (
    select p.*, c.attnum, c.attname, p.allowed or (
      p.rolname = 'memory_rpc_owner' and p.nspname = 'memory_storage' and p.privilege = 'UPDATE'
      and ((p.relname = 'admission' and c.attname in (
        'remaining', 'revision', 'request_id', 'ticket', 'fence', 'operation', 'tags', 'expires_at', 'instance_started_at'
      )) or (p.relname = 'memories' and c.attname in (
        'content', 'embedding', 'status', 'forget_reason', 'forgotten_at', 'updated_at', 'revision'
      )))
    ) as column_allowed
    from table_permissions p join pg_attribute c on c.attrelid = p.table_id
    where c.attnum > 0 and not c.attisdropped and p.privilege in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
  ), routine_permissions as (
    select r.oid as role_id, r.rolname, p.oid as routine_id, p.proowner,
      case
        when r.platform_role then false
        when s.nspname = 'memory_api' then r.rolname in ('memory_rpc', 'memory_rpc_owner')
          and p.oid in ('memory_api.reserve(uuid,text,text[])'::regprocedure, 'memory_api.execute(uuid,text,text[],jsonb)'::regprocedure)
        when s.nspname = 'memory_storage' then r.rolname = 'memory_rpc_owner' and p.oid in (
          'memory_storage.caller()'::regprocedure, 'memory_storage.check_scope(text,text,text)'::regprocedure,
          'memory_storage.last_fence(text)'::regprocedure, 'memory_storage.advance_fence(text)'::regprocedure,
          'memory_storage.check_tags(text,text,text[])'::regprocedure, 'memory_storage.consume(uuid,text,text[])'::regprocedure,
          'memory_storage.reply(jsonb,integer)'::regprocedure, 'memory_storage.next_revision(text)'::regprocedure,
          'memory_storage.view_row(memory_storage.memories)'::regprocedure, 'memory_storage.embedding(jsonb)'::regprocedure,
          'memory_storage.has_replacement(text,text,jsonb,uuid)'::regprocedure,
          'memory_storage.purge(text,text,bigint,jsonb)'::regprocedure, 'memory_storage.search(text,text,jsonb,integer)'::regprocedure
        )
        when p.oid = 'memory_gateway.access_token(jsonb)'::regprocedure then r.rolname = 'supabase_auth_admin'
        when p.oid = 'memory_gateway.check_request()'::regprocedure then
          r.rolname = 'memory_rpc' or memory_gateway.ordinary_hook_access(r.oid)
        else false
      end as allowed
    from roles r cross join pg_proc p join scope s on p.pronamespace = s.oid
  ), explicit_grants as (
    select a.grantee, s.nspname::text as object
    from scope s join pg_namespace n on n.oid = s.oid cross join lateral aclexplode(n.nspacl) a
    union all
    select a.grantee, c.oid::regclass::text
    from scope s join pg_class c on c.relnamespace = s.oid cross join lateral aclexplode(c.relacl) a
    union all
    select a.grantee, t.oid::regclass::text || '.' || c.attname
    from relations t join pg_attribute c on c.attrelid = t.oid cross join lateral aclexplode(c.attacl) a
    union all
    select a.grantee, p.oid::regprocedure::text
    from scope s join pg_proc p on p.pronamespace = s.oid cross join lateral aclexplode(p.proacl) a
  )
  select * into deviation from (
    select r.rolname, s.nspname::text as object, 'schema' as kind from roles r cross join scope s
    where has_schema_privilege(r.oid, s.oid, 'USAGE') is distinct from (
      case
        when r.platform_role then r.platform_read
        when s.nspname = 'memory_storage' then r.rolname in ('memory_rpc_owner', 'supabase_auth_admin')
        when s.nspname = 'memory_api' then r.rolname in ('memory_rpc_owner', 'memory_rpc')
        else r.rolname in ('memory_rpc', 'supabase_auth_admin') or memory_gateway.ordinary_hook_access(r.oid)
      end
    ) or has_schema_privilege(r.oid, s.oid, 'CREATE, USAGE WITH GRANT OPTION')
    union all
    select p.rolname, p.table_id::regclass::text, 'table ' || p.privilege from table_permissions p
    where has_table_privilege(p.role_id, p.table_id, p.privilege) is distinct from p.allowed
      or has_table_privilege(p.role_id, p.table_id, p.privilege || ' WITH GRANT OPTION')
    union all
    select p.rolname, p.table_id::regclass::text || '.' || p.attname, 'column ' || p.privilege from column_permissions p
    where has_column_privilege(p.role_id, p.table_id, p.attnum, p.privilege) is distinct from p.column_allowed
      or has_column_privilege(p.role_id, p.table_id, p.attnum, p.privilege || ' WITH GRANT OPTION')
    union all
    select p.rolname, p.routine_id::regprocedure::text, 'routine' from routine_permissions p
    where has_function_privilege(p.role_id, p.routine_id, 'EXECUTE') is distinct from p.allowed
      or (p.proowner <> p.role_id and has_function_privilege(p.role_id, p.routine_id, 'EXECUTE WITH GRANT OPTION'))
    union all
    select r.rolname, t.oid::regclass::text, 'sequence ' || access.privilege
    from roles r cross join relations t cross join unnest(array['SELECT', 'USAGE', 'UPDATE']) as access(privilege)
    where t.relkind = 'S' and (
      has_sequence_privilege(r.oid, t.oid, access.privilege) is distinct from
        ((r.platform_read and access.privilege = 'SELECT')
          or (r.rolname = 'memory_rpc_owner' and t.nspname = 'memory_storage'
            and t.relname in ('assistant_fence', 'people_fence') and access.privilege in ('SELECT', 'USAGE')))
      or has_sequence_privilege(r.oid, t.oid, access.privilege || ' WITH GRANT OPTION')
    )
    union all
    select r.rolname, g.object, 'explicit platform grant'
    from roles r join explicit_grants g on g.grantee = r.oid where r.platform_role
  ) violations limit 1;
  if found then
    raise exception 'Unexpected effective memory privilege'
      using detail = format('%I has a different %s ACL for %s', deviation.rolname, deviation.kind, deviation.object);
  end if;
end
$$;
revoke all on function memory_gateway.assert_effective_acl() from public, anon, authenticated, service_role;

-- tuturuuu: reviewed(dynamic-sql-review): apps/database/supabase/tests/memory-postgrest-effective-acl.sql
do $$
begin
  if current_user <> 'postgres' or exists (
    select from pg_namespace n, lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    where n.nspname = 'memory_gateway' and a.grantee <> n.nspowner
  ) or exists (
    select from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'memory_gateway'::regnamespace and a.grantee <> p.proowner
  ) then
    raise exception 'Memory ACL checks must start private';
  end if;
end
$$;
commit;
