-- Table constraints and indexes, including validity flags.
with rel as (
  select c.oid, n.nspname, c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'm', 'f')
    and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    )
)
select 'O' as kind, 'constraints' as category,
  format('%I.%I.%I', r.nspname, r.relname, k.conname) as identity,
  encode(sha256(convert_to(json_build_array(
    k.contype, pg_get_constraintdef(k.oid), k.convalidated,
    k.condeferrable, k.condeferred, k.connoinherit
  )::text, 'UTF8')), 'hex') as value
from rel r
join pg_constraint k on k.conrelid = r.oid
union all
select 'O', 'indexes',
  format('%I.%I', r.nspname, ic.relname),
  encode(sha256(convert_to(json_build_array(
    r.relname, pg_get_indexdef(x.indexrelid), x.indisvalid, x.indisready,
    x.indisunique, x.indisprimary, x.indisexclusion, x.indimmediate,
    x.indisreplident
  )::text, 'UTF8')), 'hex')
from rel r
join pg_index x on x.indrelid = r.oid
join pg_class ic on ic.oid = x.indexrelid;
