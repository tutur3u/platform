-- Table triggers (including auth.users and storage.objects) and event triggers.
select 'O' as kind, 'triggers' as category,
  format('%I.%I.%I', n.nspname, c.relname, g.tgname) as identity,
  encode(sha256(convert_to(json_build_array(
    pg_get_triggerdef(g.oid), g.tgenabled
  )::text, 'UTF8')), 'hex') as value
from pg_trigger g
join pg_class c on c.oid = g.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not g.tgisinternal
  and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
union all
select 'O', 'event_triggers', format('%I', e.evtname),
  encode(sha256(convert_to(json_build_array(
    e.evtevent, e.evtenabled, e.evtfoid::regprocedure::text,
    pg_get_userbyid(e.evtowner),
    (select json_agg(t order by t) from unnest(e.evttags) t)
  )::text, 'UTF8')), 'hex')
from pg_event_trigger e;
