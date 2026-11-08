-- Enum labels, domains and standalone composite types.
select 'O' as kind, 'types' as category,
  format('%s:%I.%I', t.typtype, n.nspname, t.typname) as identity,
  encode(sha256(convert_to(json_build_array(
    pg_get_userbyid(t.typowner),
    (select json_agg(e.enumlabel order by e.enumsortorder)
      from pg_enum e where e.enumtypid = t.oid),
    case when t.typtype = 'd' then format_type(t.typbasetype, t.typtypmod) end,
    t.typnotnull, t.typdefault,
    (select json_agg(pg_get_constraintdef(k.oid) order by k.conname)
      from pg_constraint k where k.contypid = t.oid),
    (select json_agg(json_build_array(a.attname, format_type(a.atttypid, a.atttypmod))
      order by a.attnum)
      from pg_attribute a
      where t.typtype = 'c' and a.attrelid = t.typrelid and a.attnum > 0
        and not a.attisdropped)
  )::text, 'UTF8')), 'hex') as value
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
left join pg_class c on c.oid = t.typrelid
where t.typtype in ('e', 'd', 'c')
  and (t.typtype <> 'c' or c.relkind = 'c')
  and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_type'::regclass and d.objid = t.oid and d.deptype = 'e'
  );
