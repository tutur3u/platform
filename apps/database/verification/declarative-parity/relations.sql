-- Relations (tables, views, matviews, foreign tables, sequences) and columns.
-- Payloads are hashed in the database; only identities and digests leave it.
-- Extension members are covered by the extensions category instead.
with rel as (
  select c.oid, n.nspname, c.relname, c.relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    )
)
select 'O' as kind, 'relations' as category,
  format('%s:%I.%I', r.relkind, r.nspname, r.relname) as identity,
  encode(sha256(convert_to(json_build_array(
    c.relkind, c.relpersistence, pg_get_userbyid(c.relowner),
    c.relrowsecurity, c.relforcerowsecurity, c.relreplident,
    c.relispartition, pg_get_expr(c.relpartbound, c.oid),
    case when c.relkind = 'p' then pg_get_partkeydef(c.oid) end,
    (select json_agg(o order by o) from unnest(c.reloptions) o),
    case when c.relkind in ('v', 'm') then pg_get_viewdef(c.oid) end,
    (select json_agg(i.inhparent::regclass::text order by i.inhseqno)
      from pg_inherits i where i.inhrelid = c.oid),
    s.seqtypid::regtype::text, s.seqstart, s.seqincrement, s.seqmax,
    s.seqmin, s.seqcache, s.seqcycle
  )::text, 'UTF8')), 'hex') as value
from rel r
join pg_class c on c.oid = r.oid
left join pg_sequence s on s.seqrelid = c.oid
union all
select 'O', 'columns',
  format('%I.%I.%I', r.nspname, r.relname, a.attname),
  encode(sha256(convert_to(json_build_array(
    row_number() over (partition by a.attrelid order by a.attnum),
    format_type(a.atttypid, a.atttypmod), a.attnotnull,
    pg_get_expr(ad.adbin, ad.adrelid), a.attidentity, a.attgenerated,
    case when a.attcollation <> t.typcollation then co.collname end
  )::text, 'UTF8')), 'hex')
from rel r
join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
join pg_type t on t.oid = a.atttypid
left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
left join pg_collation co on co.oid = a.attcollation
where r.relkind <> 'S';
