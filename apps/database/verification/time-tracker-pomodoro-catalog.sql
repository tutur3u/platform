-- Catalog snapshot of every object 20261026180000 changes. Take it before the
-- migration and after its rollback (psql -At); the two outputs must be equal.
select 'fn|'||p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))
  ||'|'||coalesce(p.proacl::text,'')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and (p.proname like '%time_tracker%'
   or p.proname in ('cloudflare_channel_role','_replace_running_session_locked'))
union all
select 'col|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull
  ||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
  from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where a.attrelid='private.time_tracker_controls'::regclass and a.attnum>0 and not a.attisdropped
union all
select 'con|'||conname||'|'||pg_get_constraintdef(oid)
  from pg_constraint where conrelid='private.time_tracker_controls'::regclass
union all
select 'tbl|'||coalesce(obj_description(c.oid,'pg_class'),'')||'|'||coalesce(c.relacl::text,'')
  ||'|'||c.relrowsecurity
  from pg_class c where c.oid='private.time_tracker_controls'::regclass
order by 1;
