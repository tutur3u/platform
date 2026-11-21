-- Observability ingestion for Cron Control collectors (see
-- apps/docs/build/devops/observability-analytics.mdx):
--   * private.observability_source_control   per-source stop fence (fail closed)
--   * private.observability_rollups          numeric rollups per service bucket
--   * private.observability_deploy_markers   deploy events for chart overlays
--   * private.observability_ingest_runs      counts-only run log
--   * private.product_analytics_daily        k-suppressed daily aggregates
-- Every table is RLS-enabled without policies. service_role may read them;
-- writes go only through the SECURITY DEFINER RPCs below. Rollups never hold request rows, URLs, IPs, user agents or log text;
-- product analytics never holds a person, guest, workspace or meeting id.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

create table private.observability_source_control (
  source text primary key
    check (source in ('cloudflare-workers', 'github-actions')),
  mode text not null default 'off' check (mode in ('off', 'dry_run', 'on')),
  max_requests_per_run integer not null default 4
    check (max_requests_per_run between 1 and 10),
  -- New rollup rows per UTC day; updates of existing rows are not charged.
  daily_row_budget integer not null default 40000
    check (daily_row_budget between 1000 and 200000),
  generation bigint not null default 1 check (generation >= 1),
  watermark timestamptz,
  updated_at timestamptz not null default now()
);

comment on table private.observability_source_control is
  'Stop fence per observability source. A missing row or mode off means the collector makes no provider request; a mode or budget change bumps the generation so in-flight writes are refused.';

insert into private.observability_source_control (source, daily_row_budget)
values ('cloudflare-workers', 150000), ('github-actions', 40000)
on conflict (source) do nothing;

create table private.observability_daily_writes (
  source text not null
    references private.observability_source_control (source) on delete cascade,
  day date not null,
  rows_written integer not null default 0 check (rows_written >= 0),
  primary key (source, day)
);

create or replace function private.observability_bump_generation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.mode is distinct from old.mode
     or new.max_requests_per_run is distinct from old.max_requests_per_run
     or new.daily_row_budget is distinct from old.daily_row_budget then
    new.generation := old.generation + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger observability_source_control_generation
  before update on private.observability_source_control
  for each row execute function private.observability_bump_generation();

create table private.observability_rollups (
  source text not null,
  service text not null
    check (service ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'),
  metric text not null,
  bucket_start timestamptz not null,
  bucket_seconds integer not null check (bucket_seconds in (900, 3600)),
  value double precision not null
    check (value >= 0 and value <= 1e15),
  observed_at timestamptz not null default now(),
  primary key (source, service, metric, bucket_seconds, bucket_start)
);

create index observability_rollups_bucket_idx
  on private.observability_rollups (bucket_start);
create index observability_rollups_service_idx
  on private.observability_rollups (service, metric, bucket_start desc);

comment on table private.observability_rollups is
  'Numeric rollups per source, service, allowlisted metric and time bucket. 15-minute buckets are retained for 90 days, hourly buckets for 400 days.';

create table private.observability_deploy_markers (
  source text not null,
  service text not null
    check (service ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'),
  version_id text not null check (version_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  deployed_at timestamptz not null,
  sha text check (sha is null or sha ~ '^[0-9a-f]{40}$'),
  kind text not null default 'deploy'
    check (kind in ('deploy', 'rollback', 'promotion')),
  observed_at timestamptz not null default now(),
  primary key (source, service, version_id)
);

create index observability_deploy_markers_time_idx
  on private.observability_deploy_markers (deployed_at desc);

create table private.observability_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  recorded_at timestamptz not null default now(),
  mode text not null check (mode in ('dry_run', 'on')),
  status text not null check (
    status in ('done', 'budget_exhausted', 'stopped', 'stale', 'failed', 'unknown')
  ),
  requests integer not null check (requests between 0 and 10),
  rollup_rows integer not null check (rollup_rows between 0 and 5000),
  marker_rows integer not null check (marker_rows between 0 and 200),
  window_start timestamptz,
  window_end timestamptz
);

create index observability_ingest_runs_source_idx
  on private.observability_ingest_runs (source, recorded_at desc);

comment on table private.observability_ingest_runs is
  'One row per observability collector run: mode, status and counts only. Retained for 90 days.';

create table private.product_analytics_daily (
  day date not null,
  app text not null check (app ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  metric text not null check (metric in (
    'dau', 'wau', 'signups', 'workspaces_created',
    'meet_minutes', 'meet_participants', 'meet_meetings',
    'ai_requests', 'ai_tokens', 'ai_credits', 'ai_users'
  )),
  dimension text not null default ''
    check (dimension ~ '^([a-z0-9][a-z0-9_.-]{0,63})?$'),
  value double precision check (value is null or value >= 0),
  suppressed boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (day, app, metric, dimension),
  check ((suppressed and value is null) or (not suppressed and value is not null))
);

comment on table private.product_analytics_daily is
  'Anonymous daily aggregates. A cohort of 1 to 9 people is suppressed (null value) together with every metric derived from it. Retained for 25 months.';

alter table private.observability_source_control enable row level security;
alter table private.observability_daily_writes enable row level security;
alter table private.observability_rollups enable row level security;
alter table private.observability_deploy_markers enable row level security;
alter table private.observability_ingest_runs enable row level security;
alter table private.product_analytics_daily enable row level security;

revoke all on table private.observability_source_control,
  private.observability_daily_writes,
  private.observability_rollups, private.observability_deploy_markers,
  private.observability_ingest_runs, private.product_analytics_daily
  from public, anon, authenticated, service_role;
grant select on table private.observability_source_control,
  private.observability_daily_writes,
  private.observability_rollups, private.observability_deploy_markers,
  private.observability_ingest_runs, private.product_analytics_daily
  to service_role;

-- Metric allowlist per source; anything else is refused.
create or replace function private.observability_metric_allowed(
  p_source text,
  p_metric text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select case p_source
    when 'cloudflare-workers' then p_metric in (
      'requests', 'errors', 'subrequests',
      'cpu_p50_ms', 'cpu_p99_ms', 'wall_p50_ms', 'wall_p99_ms',
      'duration_p50_ms', 'duration_p95_ms', 'duration_p99_ms',
      'do_requests', 'do_errors')
    when 'github-actions' then p_metric in (
      'runs', 'failed_runs', 'sampled_runs',
      'duration_p50_s', 'duration_p95_s', 'queue_p50_s', 'queue_p95_s')
    else false
  end;
$$;

-- Start of a run: the mode, budget, generation and watermark the collector
-- must honor. Missing rows answer off.
create or replace function private.observability_begin_ingest(p_source text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
       'mode', c.mode,
       'max_requests', c.max_requests_per_run,
       'generation', c.generation,
       'watermark', c.watermark)
       from private.observability_source_control c
      where c.source = p_source),
    jsonb_build_object('mode', 'off'));
$$;

-- Idempotent write for one run. Refused unless the source is on and the
-- generation matches; every row is validated before any is written. Newly
-- inserted rollup rows are charged to the day's row budget, and a write
-- that would exceed it is rolled back whole.
create or replace function private.observability_write_rollups(
  p_source text,
  p_generation bigint,
  p_rollups jsonb,
  p_markers jsonb,
  p_watermark timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_control private.observability_source_control%rowtype;
  v_rollups integer := 0;
  v_inserted integer := 0;
  v_markers integer := 0;
  v_day date := (now() at time zone 'utc')::date;
  v_used integer;
begin
  select * into v_control
    from private.observability_source_control
   where source = p_source
   for update;
  if not found or v_control.mode <> 'on' then
    return jsonb_build_object('state', 'off');
  end if;
  if v_control.generation <> p_generation then
    return jsonb_build_object('state', 'stale');
  end if;
  if jsonb_typeof(p_rollups) <> 'array' or jsonb_typeof(p_markers) <> 'array'
     or jsonb_array_length(p_rollups) > 5000
     or jsonb_array_length(p_markers) > 200
     or p_watermark is null or p_watermark > now() then
    return jsonb_build_object('state', 'invalid');
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rollups) r
     where jsonb_typeof(r) <> 'object'
        or not private.observability_metric_allowed(p_source, r->>'metric')
        or coalesce(r->>'service', '') !~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
        or (r->>'bucket_seconds') not in ('900', '3600')
        or jsonb_typeof(r->'value') <> 'number'
        or (r->>'value')::double precision < 0
        or (r->>'value')::double precision > 1e15
        or (r->>'bucket_start') is null
  ) then
    return jsonb_build_object('state', 'invalid');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_markers) m
     where jsonb_typeof(m) <> 'object'
        or coalesce(m->>'service', '') !~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
        or coalesce(m->>'version_id', '') !~ '^[A-Za-z0-9._:-]{1,64}$'
        or (m->>'sha' is not null and m->>'sha' !~ '^[0-9a-f]{40}$')
        or coalesce(m->>'kind', 'deploy') not in ('deploy', 'rollback', 'promotion')
        or (m->>'deployed_at') is null
  ) then
    return jsonb_build_object('state', 'invalid');
  end if;

  with written as (
    insert into private.observability_rollups as t (
      source, service, metric, bucket_start, bucket_seconds, value, observed_at)
    -- One row per key: a repeated key in one call keeps its last value.
    select distinct on (r->>'service', r->>'metric',
                        (r->>'bucket_seconds')::integer,
                        (r->>'bucket_start')::timestamptz)
           p_source, r->>'service', r->>'metric',
           (r->>'bucket_start')::timestamptz, (r->>'bucket_seconds')::integer,
           (r->>'value')::double precision, now()
      from jsonb_array_elements(p_rollups) with ordinality as e(r, position)
     order by r->>'service', r->>'metric', (r->>'bucket_seconds')::integer,
              (r->>'bucket_start')::timestamptz, position desc
    on conflict (source, service, metric, bucket_seconds, bucket_start)
    do update set value = excluded.value, observed_at = excluded.observed_at
    returning (xmax = 0) as inserted
  )
  select count(*), count(*) filter (where inserted)
    into v_rollups, v_inserted
    from written;

  insert into private.observability_daily_writes as d (source, day, rows_written)
  values (p_source, v_day, v_inserted)
  on conflict (source, day)
  do update set rows_written = d.rows_written + excluded.rows_written
  returning d.rows_written into v_used;
  if v_used > v_control.daily_row_budget then
    raise exception 'observability daily row budget' using errcode = 'P0B01';
  end if;

  insert into private.observability_deploy_markers as t (
    source, service, version_id, deployed_at, sha, kind, observed_at)
  select distinct on (m->>'service', m->>'version_id')
         p_source, m->>'service', m->>'version_id',
         (m->>'deployed_at')::timestamptz, m->>'sha',
         coalesce(m->>'kind', 'deploy'), now()
    from jsonb_array_elements(p_markers) with ordinality as e(m, position)
   order by m->>'service', m->>'version_id', position desc
  on conflict (source, service, version_id)
  do update set deployed_at = excluded.deployed_at, sha = excluded.sha,
                kind = excluded.kind, observed_at = excluded.observed_at;
  get diagnostics v_markers = row_count;

  update private.observability_source_control
     set watermark = greatest(coalesce(watermark, p_watermark), p_watermark)
   where source = p_source;

  return jsonb_build_object(
    'state', 'written', 'rollup_rows', v_rollups, 'marker_rows', v_markers);
exception
  when sqlstate 'P0B01' then
    return jsonb_build_object('state', 'budget');
  when invalid_datetime_format or datetime_field_overflow
       or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('state', 'invalid');
end;
$$;

create or replace function private.record_observability_ingest_run(
  p_source text,
  p_mode text,
  p_status text,
  p_requests integer,
  p_rollup_rows integer,
  p_marker_rows integer,
  p_window_start timestamptz,
  p_window_end timestamptz
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  insert into private.observability_ingest_runs (
    source, mode, status, requests, rollup_rows, marker_rows,
    window_start, window_end)
  select p_source, p_mode, p_status, p_requests, p_rollup_rows, p_marker_rows,
         p_window_start, p_window_end
   where exists (
     select 1 from private.observability_source_control c
      where c.source = p_source)
  returning jsonb_build_object('recorded', 1);
$$;

-- Bounded retention, at most p_limit rows per table per call.
create or replace function private.prune_observability_rollups(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 0), 0), 1000);
  v_rollups integer;
  v_markers integer;
  v_runs integer;
  v_analytics integer;
begin
  delete from private.observability_rollups r
   using (select source, service, metric, bucket_seconds, bucket_start
            from private.observability_rollups
           where (bucket_seconds = 900 and bucket_start < now() - interval '90 days')
              or bucket_start < now() - interval '400 days'
           order by bucket_start
           limit v_limit) d
   where r.source = d.source and r.service = d.service
     and r.metric = d.metric and r.bucket_seconds = d.bucket_seconds
     and r.bucket_start = d.bucket_start;
  get diagnostics v_rollups = row_count;

  delete from private.observability_deploy_markers m
   using (select source, service, version_id
            from private.observability_deploy_markers
           where deployed_at < now() - interval '400 days'
           order by deployed_at
           limit v_limit) d
   where m.source = d.source and m.service = d.service
     and m.version_id = d.version_id;
  get diagnostics v_markers = row_count;

  delete from private.observability_ingest_runs
   where id in (select id from private.observability_ingest_runs
                 where recorded_at < now() - interval '90 days'
                 order by recorded_at
                 limit v_limit);
  get diagnostics v_runs = row_count;

  delete from private.product_analytics_daily p
   using (select day, app, metric, dimension
            from private.product_analytics_daily
           where day < (now() at time zone 'utc')::date - interval '25 months'
           order by day
           limit v_limit) d
   where p.day = d.day and p.app = d.app
     and p.metric = d.metric and p.dimension = d.dimension;
  get diagnostics v_analytics = row_count;

  delete from private.observability_daily_writes
   where day < (now() at time zone 'utc')::date - 7;

  return jsonb_build_object(
    'rollups', v_rollups, 'markers', v_markers,
    'runs', v_runs, 'analytics', v_analytics);
end;
$$;

-- Admin read path: rollups aggregated per service and step, returned as one
-- JSON array so PostgREST row limits cannot truncate it. Counts are summed;
-- quantiles are request-weighted means of the bucket quantiles, which
-- approximate the window quantile. `buckets` is the number of 15-minute
-- buckets with Worker or Durable Object traffic, for coverage.
create or replace function private.observability_rollup_window(
  p_since timestamptz,
  p_until timestamptz,
  p_step_seconds integer,
  p_service text default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with params as (
    select p_since as since, p_until as until,
           greatest(900, p_step_seconds) as step
     where p_until > p_since
       and p_until - p_since <= interval '31 days'
       and p_step_seconds between 900 and 2678400
       and (p_service is null or p_service ~ '^[a-z0-9][a-z0-9._/-]{0,127}$')
  ),
  base as (
    select r.service, r.metric, r.value, r.bucket_start,
           -- Steps are anchored at the window start, so a step as long as
           -- the window yields one row per service and metric.
           p.since + make_interval(secs =>
             floor(extract(epoch from (r.bucket_start - p.since)) / p.step)
               * p.step) as step_start
      from private.observability_rollups r, params p
     where r.source = 'cloudflare-workers'
       and r.bucket_seconds = 900
       and r.bucket_start >= p.since and r.bucket_start < p.until
       and (p_service is null or r.service = p_service)
  ),
  weights as (
    select service, bucket_start, value as requests
      from base where metric = 'requests'
  ),
  aggregated as (
    select b.service, b.step_start, b.metric,
           case
             when b.metric in ('requests', 'errors', 'subrequests',
                               'do_requests', 'do_errors')
               then sum(b.value)
             else coalesce(
               sum(b.value * w.requests) filter (where w.requests > 0)
                 / nullif(sum(w.requests) filter (where w.requests > 0), 0),
               avg(b.value))
           end as value
      from base b
      left join weights w
        on w.service = b.service and w.bucket_start = b.bucket_start
     group by b.service, b.step_start, b.metric
    union all
    select service, step_start, 'buckets',
           count(distinct bucket_start)::double precision
      from base
     where metric in ('requests', 'do_requests')
     group by service, step_start
  ),
  limited as (
    select * from aggregated
     where service in (select distinct service from aggregated
                        order by service limit 500)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'service', service,
           'bucket_start', to_char(step_start at time zone 'utc',
                                   'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'metric', metric,
           'value', round(value::numeric, 3))
           order by service, step_start, metric), '[]'::jsonb)
    from limited;
$$;

revoke all on function private.observability_rollup_window(
  timestamptz, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function private.observability_rollup_window(
  timestamptz, timestamptz, integer, text) to service_role;

-- tuturuuu: no-grant (trigger)
revoke all on function private.observability_bump_generation()
  from public, anon, authenticated;
revoke all on function private.observability_metric_allowed(text, text)
  from public, anon, authenticated;
revoke all on function private.observability_begin_ingest(text)
  from public, anon, authenticated;
revoke all on function private.observability_write_rollups(
  text, bigint, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function private.record_observability_ingest_run(
  text, text, text, integer, integer, integer, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function private.prune_observability_rollups(integer)
  from public, anon, authenticated;

grant execute on function private.observability_metric_allowed(text, text)
  to service_role;
grant execute on function private.observability_begin_ingest(text)
  to service_role;
grant execute on function private.observability_write_rollups(
  text, bigint, jsonb, jsonb, timestamptz) to service_role;
grant execute on function private.record_observability_ingest_run(
  text, text, text, integer, integer, integer, timestamptz, timestamptz)
  to service_role;
grant execute on function private.prune_observability_rollups(integer)
  to service_role;

COMMIT;
