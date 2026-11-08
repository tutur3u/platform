-- Raw ACLs per object. NULL (owner defaults, PUBLIC EXECUTE on functions) stays
-- distinct from an explicit list, including an empty one. Sorted aclitem text
-- carries grantee, privileges, grant options and grantor, as aclexplode would.
-- Extension members are included: their grants are application policy.
select 'O' as kind, 'acl_relations' as category,
  format('%s:%I.%I', c.relkind, n.nspname, c.relname) as identity,
  encode(sha256(convert_to(json_build_array(
    case when c.relacl is not null then
      (select coalesce(json_agg(a::text order by a::text), '[]') from unnest(c.relacl) a)
    end
  )::text, 'UTF8')), 'hex') as value
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
union all
select 'O', 'acl_columns', format('%I.%I.%I', n.nspname, c.relname, a.attname),
  encode(sha256(convert_to(json_build_array(
    (select json_agg(x::text order by x::text) from unnest(a.attacl) x)
  )::text, 'UTF8')), 'hex')
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where a.attacl is not null and a.attnum > 0 and not a.attisdropped
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
  and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
union all
select 'O', 'acl_schemas', format('%I', n.nspname),
  encode(sha256(convert_to(json_build_array(
    pg_get_userbyid(n.nspowner),
    case when n.nspacl is not null then
      (select coalesce(json_agg(a::text order by a::text), '[]') from unnest(n.nspacl) a)
    end
  )::text, 'UTF8')), 'hex')
from pg_namespace n
where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
union all
select 'O', 'acl_functions', p.oid::regprocedure::text,
  encode(sha256(convert_to(json_build_array(
    case when p.proacl is not null then
      (select coalesce(json_agg(a::text order by a::text), '[]') from unnest(p.proacl) a)
    end
  )::text, 'UTF8')), 'hex')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname !~ '^pg_' and n.nspname <> 'information_schema';
