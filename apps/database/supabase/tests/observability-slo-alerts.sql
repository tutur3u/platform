-- SLO burn evaluation behind the Cron Control job `observability-slo-burn`:
-- multi-window firing, unavailable windows, resolution, the read path and
-- grants. Synthetic rollups only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select plan(14);

select ok(has_function_privilege('service_role', 'private.evaluate_observability_slos(integer)', 'execute'),
  'service caller can evaluate');
select ok(not has_function_privilege('authenticated', 'private.evaluate_observability_slos(integer)', 'execute')
  and not has_function_privilege('anon', 'private.list_observability_alerts(integer)', 'execute'),
  'clients cannot evaluate or list');
select ok(not has_table_privilege('service_role', 'private.observability_alerts', 'insert')
  and not has_table_privilege('authenticated', 'private.observability_slos', 'select'),
  'alerts are written only by the evaluator');
select is((select count(*) from private.observability_slos where enabled), 2::bigint,
  'two default SLOs are seeded');

-- Six hours of buckets ending at the last closed bucket: a failing service,
-- and one with too little traffic to judge.
create temporary table fixture_window as
select to_timestamp(floor(extract(epoch from now()) / 900) * 900) as until;

insert into private.observability_rollups (source, service, metric, bucket_start, bucket_seconds, value)
select 'cloudflare-workers', svc, metric,
       (select until from fixture_window) - make_interval(mins => 15 * k), 900,
       case metric
         when 'requests' then case svc when 'tuturuuu-broken' then 1000 else 1 end
         when 'errors' then case svc when 'tuturuuu-broken' then 200 else 1 end
         else 100 end
  from generate_series(1, 24) k,
       unnest(array['tuturuuu-broken', 'tuturuuu-quiet']) svc,
       unnest(array['requests', 'errors', 'duration_p95_ms']) metric;

select is((private.evaluate_observability_slos(500)->>'firing')::integer, 2,
  'availability fires at page and ticket severity');
select is((select count(*) from private.observability_alerts
            where service = 'tuturuuu-broken' and state = 'firing'), 2::bigint,
  'one open alert per severity');
select is((select count(*) from private.observability_alerts where service = 'tuturuuu-quiet'), 0::bigint,
  'a low-traffic window never fires');
select ok((select bool_and(dedupe_key ~ '^[a-z0-9:._-]{1,190}$') from private.observability_alerts),
  'dedupe keys fit the operator alert sender');

select is((private.evaluate_observability_slos(500)->>'firing')::integer, 2,
  'a repeated pass keeps the same alerts');
select is((select count(*) from private.observability_alerts), 2::bigint,
  'a repeated pass does not duplicate alerts');

select is(jsonb_array_length(private.list_observability_alerts(50)), 2,
  'the read path lists open alerts');

-- Recovery: errors stop; two healthy passes resolve.
update private.observability_rollups set value = 0
 where service = 'tuturuuu-broken' and metric = 'errors';
select private.evaluate_observability_slos(500);
select is((select count(*) from private.observability_alerts where state = 'firing'), 2::bigint,
  'one healthy pass does not resolve');
select private.evaluate_observability_slos(500);
select is((select count(*) from private.observability_alerts where state = 'resolved'), 2::bigint,
  'two healthy passes resolve');

-- Missing data never resolves an open alert.
delete from private.observability_alerts;
insert into private.observability_alerts (dedupe_key, slo_id, service, severity, started_at, burn_long, burn_short)
values ('slo:workers-availability:page:tuturuuu-gone:x', 'workers-availability', 'tuturuuu-gone', 'page', now(), 20, 20);
select private.evaluate_observability_slos(500);
select private.evaluate_observability_slos(500);
select is((select state from private.observability_alerts where service = 'tuturuuu-gone'), 'firing',
  'an unavailable service keeps its alert open');

select * from finish();
rollback;
