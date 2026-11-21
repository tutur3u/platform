-- SLO burn alerts for the Cron Control job `observability-slo-burn` (see
-- apps/docs/build/devops/observability-analytics.mdx). Burn rates come from
-- private.observability_rollups; firing and resolved alerts are delivered
-- once each through private.send_root_operator_alert and exposed to the
-- Fleet hub and the Perf Factory through an Admin read RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

create table private.observability_slos (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  -- A Worker script name, or '*' for every script with enough traffic.
  service text not null
    check (service = '*' or service ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'),
  indicator text not null check (indicator in ('availability', 'latency')),
  objective numeric(7, 6) not null check (objective >= 0.9 and objective < 1),
  latency_threshold_ms integer
    check (latency_threshold_ms is null or latency_threshold_ms between 10 and 60000),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  check ((indicator = 'latency') = (latency_threshold_ms is not null))
);

comment on table private.observability_slos is
  'Service level objectives evaluated by observability-slo-burn. Availability burns on the 5xx share; latency burns on the request share in 15-minute buckets whose p95 exceeds the threshold.';

insert into private.observability_slos (id, service, indicator, objective, latency_threshold_ms)
values ('workers-availability', '*', 'availability', 0.995, null),
       ('workers-latency', '*', 'latency', 0.99, 1000)
on conflict (id) do nothing;

create table private.observability_alerts (
  dedupe_key text primary key check (dedupe_key ~ '^[a-z0-9:._-]{1,190}$'),
  slo_id text not null references private.observability_slos (id) on delete cascade,
  service text not null,
  severity text not null check (severity in ('page', 'ticket')),
  state text not null default 'firing' check (state in ('firing', 'resolved')),
  started_at timestamptz not null,
  last_evaluated_at timestamptz not null default now(),
  resolved_at timestamptz,
  burn_long double precision not null check (burn_long >= 0),
  burn_short double precision not null check (burn_short >= 0),
  healthy_windows integer not null default 0 check (healthy_windows >= 0),
  fired_notified boolean not null default false,
  resolved_notified boolean not null default false
);

create unique index observability_alerts_open_idx
  on private.observability_alerts (slo_id, service, severity)
  where state = 'firing';
create index observability_alerts_recent_idx
  on private.observability_alerts (last_evaluated_at desc);

alter table private.observability_slos enable row level security;
alter table private.observability_alerts enable row level security;
revoke all on table private.observability_slos, private.observability_alerts
  from public, anon, authenticated, service_role;
grant select on table private.observability_slos, private.observability_alerts
  to service_role;

-- Burn rate of one SLO and service over [p_since, p_until): the bad share
-- divided by the error budget. Null when the window has less than 50
-- requests or more than a quarter of its buckets missing (unavailable,
-- never healthy).
create or replace function private.observability_burn_rate(
  p_slo private.observability_slos,
  p_service text,
  p_since timestamptz,
  p_until timestamptz
)
returns double precision
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with buckets as (
    select r.bucket_start,
           max(r.value) filter (where r.metric = 'requests') as requests,
           max(r.value) filter (where r.metric = 'errors') as errors,
           max(r.value) filter (where r.metric = 'duration_p95_ms') as p95
      from private.observability_rollups r
     where r.source = 'cloudflare-workers'
       and r.bucket_seconds = 900
       and r.service = p_service
       and r.bucket_start >= p_since and r.bucket_start < p_until
     group by r.bucket_start
  ),
  totals as (
    select count(*) filter (where requests is not null) as present,
           coalesce(sum(requests), 0) as requests,
           coalesce(sum(errors), 0) as errors,
           coalesce(sum(requests) filter (
             where p95 > p_slo.latency_threshold_ms), 0) as slow
      from buckets
  )
  select case
           when t.requests < 50
             or t.present < ceil(extract(epoch from (p_until - p_since)) / 900 * 0.75)
             then null
           when p_slo.indicator = 'availability'
             then (t.errors / t.requests) / (1 - p_slo.objective)::double precision
           else (t.slow / t.requests) / (1 - p_slo.objective)::double precision
         end
    from totals t;
$$;

-- One evaluation pass, bounded to p_limit SLO and service pairs. A page
-- fires when both the 1-hour and the latest 15-minute burn exceed 14.4; a
-- ticket when both the 6-hour and 1-hour burn exceed 6. An open alert
-- resolves after two consecutive evaluations below its thresholds. Each
-- transition is delivered once through send_root_operator_alert.
create or replace function private.evaluate_observability_slos(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 0), 1), 500);
  v_until timestamptz := to_timestamp(
    floor(extract(epoch from transaction_timestamp()) / 900) * 900);
  v_pair record;
  v_short double precision;
  v_hour double precision;
  v_six double precision;
  v_severity text;
  v_long double precision;
  v_short_burn double precision;
  v_breach boolean;
  v_alert private.observability_alerts%rowtype;
  v_key text;
  v_evaluated integer := 0;
  v_firing integer := 0;
  v_notified integer := 0;
  v_sent integer;
begin
  for v_pair in
    select s, svc.service
      from private.observability_slos s
      cross join lateral (
        select distinct r.service
          from private.observability_rollups r
         where r.source = 'cloudflare-workers'
           and r.bucket_seconds = 900
           and r.metric = 'requests'
           and r.bucket_start >= v_until - interval '6 hours'
           and (s.service = '*' or r.service = s.service)
      ) svc
     where s.enabled
     order by s.id, svc.service
     limit v_limit
  loop
    v_evaluated := v_evaluated + 1;
    v_short := private.observability_burn_rate(
      v_pair.s, v_pair.service, v_until - interval '15 minutes', v_until);
    v_hour := private.observability_burn_rate(
      v_pair.s, v_pair.service, v_until - interval '1 hour', v_until);
    v_six := private.observability_burn_rate(
      v_pair.s, v_pair.service, v_until - interval '6 hours', v_until);

    foreach v_severity in array array['page', 'ticket'] loop
      if v_severity = 'page' then
        v_long := v_hour; v_short_burn := v_short;
        v_breach := v_hour >= 14.4 and v_short >= 14.4;
      else
        v_long := v_six; v_short_burn := v_hour;
        v_breach := v_six >= 6 and v_hour >= 6;
      end if;

      select * into v_alert
        from private.observability_alerts
       where slo_id = (v_pair.s).id and service = v_pair.service
         and severity = v_severity and state = 'firing'
       for update;

      if coalesce(v_breach, false) then
        v_firing := v_firing + 1;
        if not found then
          -- The sender accepts [a-z0-9:._-]; ':resolved' is appended later.
          v_key := left(format('slo:%s:%s:%s:%s', (v_pair.s).id, v_severity,
                               regexp_replace(v_pair.service, '[^a-z0-9._-]', '-', 'g'),
                               to_char(v_until at time zone 'utc',
                                       'YYYYMMDD"t"HH24MI')), 190);
          insert into private.observability_alerts (
            dedupe_key, slo_id, service, severity, started_at,
            burn_long, burn_short)
          values (v_key, (v_pair.s).id, v_pair.service, v_severity,
                  v_until, v_long, v_short_burn)
          on conflict (dedupe_key) do nothing;
        else
          update private.observability_alerts
             set burn_long = v_long, burn_short = v_short_burn,
                 healthy_windows = 0, last_evaluated_at = now()
           where dedupe_key = v_alert.dedupe_key;
        end if;
      elsif found and v_long is not null and v_short_burn is not null then
        -- Unavailable windows neither resolve nor extend an alert.
        update private.observability_alerts
           set healthy_windows = healthy_windows + 1,
               last_evaluated_at = now(),
               state = case when healthy_windows + 1 >= 2 then 'resolved' else state end,
               resolved_at = case when healthy_windows + 1 >= 2 then now() else resolved_at end
         where dedupe_key = v_alert.dedupe_key;
      end if;
    end loop;
  end loop;

  -- Delivery: at most 20 transitions per pass, each once.
  for v_alert in
    select * from private.observability_alerts
     where (state = 'firing' and not fired_notified)
        or (state = 'resolved' and not resolved_notified)
     order by started_at
     limit 20
     for update skip locked
  loop
    v_sent := private.send_root_operator_alert(
      'observability.slo_burn',
      v_alert.dedupe_key || case when v_alert.state = 'resolved' then ':resolved' else '' end,
      left(format('%s %s: %s', case when v_alert.state = 'resolved'
                                    then 'Recovered' else 'SLO burn' end,
                  v_alert.severity, v_alert.service), 200),
      left(format('SLO %s burn %s (long) and %s (short).', v_alert.slo_id,
                  round(v_alert.burn_long::numeric, 1),
                  round(v_alert.burn_short::numeric, 1)), 2000),
      jsonb_build_object(
        'slo_id', v_alert.slo_id, 'service', v_alert.service,
        'severity', v_alert.severity, 'state', v_alert.state,
        'started_at', v_alert.started_at),
      array['view_infrastructure'],
      (case when v_alert.severity = 'page' and v_alert.state = 'firing'
            then 'urgent' else 'medium' end)::public.notification_priority);
    -- Null means the key was already sent; either way it is delivered.
    if v_sent is null or v_sent > 0 then
      update private.observability_alerts
         set fired_notified = true,
             resolved_notified = resolved_notified or state = 'resolved'
       where dedupe_key = v_alert.dedupe_key;
      v_notified := v_notified + 1;
    end if;
  end loop;

  -- Resolved alerts are kept for 90 days.
  delete from private.observability_alerts
   where dedupe_key in (
     select dedupe_key from private.observability_alerts
      where state = 'resolved' and resolved_notified
        and resolved_at < now() - interval '90 days'
      order by resolved_at
      limit 100);

  return jsonb_build_object(
    'evaluated', least(v_evaluated, 1000),
    'firing', least(v_firing, 1000),
    'notified', v_notified);
end;
$$;

-- Admin, Fleet hub and Perf Factory read path: firing alerts and those
-- resolved in the last day, newest first.
create or replace function private.list_observability_alerts(p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'dedupe_key', a.dedupe_key, 'slo_id', a.slo_id,
           'service', a.service, 'severity', a.severity, 'state', a.state,
           'indicator', s.indicator, 'objective', s.objective,
           'latency_threshold_ms', s.latency_threshold_ms,
           'started_at', a.started_at, 'resolved_at', a.resolved_at,
           'burn_long', round(a.burn_long::numeric, 3),
           'burn_short', round(a.burn_short::numeric, 3))
           order by a.started_at desc), '[]'::jsonb)
    from (
      select * from private.observability_alerts
       where state = 'firing' or resolved_at >= now() - interval '1 day'
       order by started_at desc
       limit least(greatest(coalesce(p_limit, 0), 1), 200)
    ) a
    join private.observability_slos s on s.id = a.slo_id;
$$;

revoke all on function private.observability_burn_rate(
  private.observability_slos, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function private.evaluate_observability_slos(integer)
  from public, anon, authenticated;
revoke all on function private.list_observability_alerts(integer)
  from public, anon, authenticated;
grant execute on function private.observability_burn_rate(
  private.observability_slos, text, timestamptz, timestamptz) to service_role;
grant execute on function private.evaluate_observability_slos(integer)
  to service_role;
grant execute on function private.list_observability_alerts(integer)
  to service_role;

COMMIT;
