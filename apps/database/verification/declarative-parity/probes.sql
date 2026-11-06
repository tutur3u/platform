-- Effective-privilege probes (has_*_privilege) over the API-exposed schemas plus
-- private. ACL text can match while effective access differs, so DB-A and DB-B
-- must match row for row. PUBLIC is evaluated from the effective ACL (NULL means
-- acldefault), which is what a role with no memberships receives. A missing
-- role probes as null.
with target as (
  select n.oid, n.nspname from pg_namespace n
  where n.nspname = any(
    string_to_array(current_setting('parity.api_schemas'), ',')
    || array['public', 'private']
  )
),
probe_role as (
  select r.name, to_regrole(r.name) as oid
  from unnest(array['anon', 'authenticated', 'service_role']) r(name)
),
fn as (
  select p.oid::regprocedure::text as identity, p.prosecdef,
    (select json_object_agg(r.name, has_function_privilege(r.oid, p.oid, 'EXECUTE')
      order by r.name) from probe_role r)::jsonb as roles,
    exists (
      select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) as public_execute
  from pg_proc p join target t on t.oid = p.pronamespace
),
priv as (
  select unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
    'REFERENCES', 'TRIGGER', 'MAINTAIN']) as name
),
tbl as (
  select format('%s:%I.%I', c.relkind, t.nspname, c.relname) as identity,
    (select json_object_agg(r.name || ':' || v.name,
      case when v.name <> 'MAINTAIN'
        or current_setting('server_version_num')::int >= 170000
        then has_table_privilege(r.oid, c.oid, v.name) end
      order by r.name || ':' || v.name)
      from probe_role r, priv v where r.name <> 'service_role')::jsonb as privs
  from pg_class c join target t on t.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
),
col as (
  select format('%I.%I.%I', t.nspname, c.relname, a.attname) as identity,
    (select json_object_agg(r.name || ':' || v.name,
      has_column_privilege(r.oid, c.oid, a.attnum, v.name)
      order by r.name || ':' || v.name)
      from probe_role r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) v(name)
      where r.name <> 'service_role')::jsonb as privs
  from pg_class c join target t on t.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
),
sch as (
  select format('%I', n.nspname) as identity,
    (select json_object_agg(r.name || ':' || v.name,
      has_schema_privilege(r.oid, n.oid, v.name) order by r.name || ':' || v.name)
      from probe_role r, unnest(array['USAGE', 'CREATE']) v(name)
      where r.name <> 'service_role')::jsonb as privs
  from pg_namespace n
  where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
)
select 'O' as kind, 'probe_functions' as category, identity,
  encode(sha256(convert_to(json_build_array(roles, public_execute)::text, 'UTF8')), 'hex')
    as value
from fn
union all
select 'O', 'probe_tables', identity,
  encode(sha256(convert_to(privs::text, 'UTF8')), 'hex') from tbl
union all
select 'O', 'probe_columns', identity,
  encode(sha256(convert_to(privs::text, 'UTF8')), 'hex') from col
union all
select 'O', 'probe_schemas', identity,
  encode(sha256(convert_to(privs::text, 'UTF8')), 'hex') from sch
union all
select 'M', 'anon_execute_function_count', '', count(*)::text
from fn where (roles ->> 'anon')::boolean
union all
select 'M', 'public_execute_function_count', '', count(*)::text
from fn where public_execute
union all
select 'M', 'public_execute_definer_count', '', count(*)::text
from fn where public_execute and prosecdef
union all
select 'M', 'anon_table_privilege_count', '', count(*)::text
from tbl, jsonb_each_text(privs) e where e.key like 'anon:%' and e.value = 'true'
union all
select 'M', 'anon_column_privilege_count', '', count(*)::text
from col, jsonb_each_text(privs) e where e.key like 'anon:%' and e.value = 'true'
union all
select 'M', 'client_create_schema_count', '', count(*)::text
from sch where (privs ->> 'anon:CREATE')::boolean or (privs ->> 'authenticated:CREATE')::boolean;
