-- Extension versions and Realtime/logical publications with their members.
select 'O' as kind, 'extensions' as category, format('%I', e.extname) as identity,
  encode(sha256(convert_to(json_build_array(
    e.extversion, n.nspname, e.extrelocatable
  )::text, 'UTF8')), 'hex') as value
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
union all
select 'O', 'publications', format('%I', p.pubname),
  encode(sha256(convert_to(json_build_array(
    p.puballtables, p.pubinsert, p.pubupdate, p.pubdelete, p.pubtruncate,
    p.pubviaroot,
    (select json_agg(n.nspname::text order by n.nspname)
      from pg_publication_namespace pn
      join pg_namespace n on n.oid = pn.pnnspid where pn.pnpubid = p.oid)
  )::text, 'UTF8')), 'hex')
from pg_publication p
union all
select 'O', 'publication_tables',
  format('%I:%s', p.pubname, r.prrelid::regclass::text),
  encode(sha256(convert_to(json_build_array(
    pg_get_expr(r.prqual, r.prrelid),
    (select json_agg(a.attname::text order by a.attname)
      from pg_attribute a
      where a.attrelid = r.prrelid and a.attnum = any(r.prattrs::int2[]))
  )::text, 'UTF8')), 'hex')
from pg_publication_rel r
join pg_publication p on p.oid = r.prpubid;
