-- Function definitions plus three must-be-zero definer checks, all scoped to
-- application schemas (Supabase-managed schemas are listed in managed_ns):
-- a NULL proacl (PUBLIC can EXECUTE), EXECUTE for PUBLIC or anon, and search
-- paths failing security_definer_path_is_safe from
-- supabase/tests/security-definer-search-paths.sql (mirrored without DDL).
with managed_ns(nspname) as (
  values ('auth'), ('storage'), ('realtime'), ('_realtime'), ('extensions'),
    ('graphql'), ('graphql_public'), ('vault'), ('pgsodium'), ('pgsodium_masks'),
    ('net'), ('supabase_functions'), ('supabase_migrations'), ('cron'),
    ('pgbouncer'), ('_analytics'), ('pgtle'), ('pgmq')
),
fn as (
  select p.oid, p.oid::regprocedure::text as identity, n.nspname, p.prokind,
    p.prosecdef, p.proacl, p.proconfig, p.proowner,
    n.nspname not in (select nspname from managed_ns) as app
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
),
null_acl as (
  select identity from fn where app and prosecdef and proacl is null
),
client_definer as (
  select identity from fn
  where app and prosecdef and (
    coalesce(has_function_privilege(to_regrole('anon'), oid, 'EXECUTE'), false)
    or exists (
      select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    )
  )
),
exposed_definer as (
  select f.identity,
    (select substr(s, 13) from unnest(f.proconfig) s
      where s like 'search_path=%') as path
  from fn f
  where f.prosecdef and f.prokind = 'f'
    and f.nspname = any(
      string_to_array(current_setting('parity.api_schemas'), ',')
      || array['public', 'private']
    )
    and f.app
),
path_part as (
  select e.identity, t.ord, cardinality(sp.parts) as total,
    case when btrim(t.raw) ~ '^"([^".,]|"")*"$'
      then replace(substr(btrim(t.raw), 2, length(btrim(t.raw)) - 2), '""', '"')
      else lower(btrim(t.raw)) end as name
  from exposed_definer e,
    lateral (select regexp_split_to_array(e.path, '\s*,\s*') as parts) sp,
    lateral unnest(sp.parts) with ordinality as t(raw, ord)
  where e.path is not null and btrim(e.path) not in ('', '""')
),
path_check as (
  select p.identity,
    case
      when p.name = 'pg_temp' then p.ord <> p.total
      when p.ord = p.total then true
      when p.name in ('$user', '') or p.name ~ '^pg_(toast_)?temp_' then true
      when x.oid is null then true
      else coalesce(has_schema_privilege(to_regrole('anon'), x.oid, 'CREATE'), true)
        or coalesce(has_schema_privilege(to_regrole('authenticated'), x.oid, 'CREATE'), true)
        or exists (
          select 1 from aclexplode(coalesce(x.nspacl, acldefault('n', x.nspowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'CREATE'
        )
    end as unsafe
  from path_part p
  left join pg_namespace x on x.nspname = p.name
),
unsafe_path as (
  select identity from exposed_definer
  where path is null or btrim(path) in ('', '""')
  union
  select identity from path_check group by identity having bool_or(unsafe)
)
select 'O' as kind, 'functions' as category, f.identity,
  encode(sha256(convert_to(json_build_array(
    p.prokind, l.lanname, p.prosecdef, p.provolatile, p.proisstrict,
    p.proleakproof, p.proparallel, p.proretset, pg_get_userbyid(p.proowner),
    (select json_agg(s order by s) from unnest(p.proconfig) s),
    pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
    p.prosrc, p.probin
  )::text, 'UTF8')), 'hex') as value
from fn f
join pg_proc p on p.oid = f.oid
join pg_language l on l.oid = p.prolang
union all
select 'M', 'null_acl_definer_count', '', count(*)::text from null_acl
union all
select 'F', 'null_acl_definer', identity, '' from null_acl
union all
select 'M', 'client_executable_definer_count', '', count(*)::text
from client_definer
union all
select 'F', 'client_executable_definer', identity, '' from client_definer
union all
select 'M', 'unsafe_definer_search_path_count', '', count(*)::text from unsafe_path
union all
select 'F', 'unsafe_definer_search_path', identity, '' from unsafe_path;
