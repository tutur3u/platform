-- Observability ingestion: the per-source stop fence, generation check,
-- validation, idempotent upserts, daily row budget, run log, retention and
-- the product analytics rollup behind the Cron Control observability jobs.
-- Synthetic rows only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select plan(44);

-- Grants: service_role executes the RPCs; clients get nothing.
select ok(has_function_privilege('service_role', 'private.observability_begin_ingest(text)', 'execute'),
  'service caller can begin a run');
select ok(has_function_privilege('service_role',
  'private.observability_write_rollups(text,bigint,jsonb,jsonb,timestamp with time zone)', 'execute'),
  'service caller can write rollups');
select ok(has_function_privilege('service_role', 'private.rollup_product_analytics_daily(integer)', 'execute'),
  'service caller can roll up product analytics');
select ok(has_function_privilege('service_role', 'private.prune_observability_rollups(integer)', 'execute'),
  'service caller can prune');
select ok(not has_function_privilege('anon', 'private.observability_write_rollups(text,bigint,jsonb,jsonb,timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'private.observability_write_rollups(text,bigint,jsonb,jsonb,timestamp with time zone)', 'execute'),
  'clients cannot write rollups');
select ok(not has_function_privilege('authenticated', 'private.rollup_product_analytics_daily(integer)', 'execute')
  and not has_function_privilege('anon', 'private.observability_begin_ingest(text)', 'execute'),
  'clients cannot run the rollup or read the fence');
select ok(not has_table_privilege('authenticated', 'private.observability_rollups', 'select')
  and not has_table_privilege('anon', 'private.product_analytics_daily', 'select'),
  'clients cannot read rollups or analytics');
select ok(not has_table_privilege('service_role', 'private.observability_rollups', 'insert')
  and not has_table_privilege('service_role', 'private.observability_source_control', 'update')
  and not has_table_privilege('service_role', 'private.product_analytics_daily', 'delete'),
  'service role writes only through the RPCs');
select ok(has_table_privilege('service_role', 'private.observability_rollups', 'select'),
  'service role can read rollups for Admin');

-- The fence starts closed and fails closed.
select is(private.observability_begin_ingest('cloudflare-workers')->>'mode', 'off',
  'seeded sources start off');
select is(private.observability_begin_ingest('unknown-source'), '{"mode": "off"}'::jsonb,
  'an unknown source answers off');

create temporary table fixture_rows as
select jsonb_build_array(
  jsonb_build_object('service', 'tuturuuu-meet', 'metric', 'requests',
    'bucket_start', '2026-11-21T02:00:00Z', 'bucket_seconds', 900, 'value', 10),
  jsonb_build_object('service', 'tuturuuu-meet', 'metric', 'cpu_p99_ms',
    'bucket_start', '2026-11-21T02:00:00Z', 'bucket_seconds', 900, 'value', 12.5)
) as rollups,
jsonb_build_array(
  jsonb_build_object('service', 'meet', 'version_id', 'gha-1',
    'deployed_at', '2026-11-21T01:00:00Z', 'sha', repeat('a', 40))
) as markers;

select is(private.observability_write_rollups('cloudflare-workers', 1,
  (select rollups from fixture_rows), '[]', '2026-11-21T02:15:00Z')->>'state', 'off',
  'a write is refused while the source is off');

update private.observability_source_control set mode = 'on'
 where source = 'cloudflare-workers';
select is((private.observability_begin_ingest('cloudflare-workers')->>'generation')::bigint, 2::bigint,
  'a mode change bumps the generation');
select is(private.observability_write_rollups('cloudflare-workers', 1,
  (select rollups from fixture_rows), '[]', '2026-11-21T02:15:00Z')->>'state', 'stale',
  'a stale generation is refused');
select is((select count(*) from private.observability_rollups), 0::bigint,
  'nothing was written by refused calls');

select is(private.observability_write_rollups('cloudflare-workers', 2,
  (select rollups from fixture_rows), (select markers from fixture_rows),
  '2026-11-21T02:15:00Z')->>'state', 'written', 'a current write lands');
select is((select count(*) from private.observability_rollups), 2::bigint, 'two rollups stored');
select is((select count(*) from private.observability_deploy_markers), 1::bigint, 'one marker stored');
select is((select watermark from private.observability_source_control where source = 'cloudflare-workers'),
  '2026-11-21T02:15:00Z'::timestamptz, 'the watermark advances');

select is(private.observability_write_rollups('cloudflare-workers', 2,
  jsonb_set((select rollups from fixture_rows), '{0,value}', '11'), '[]',
  '2026-11-21T02:00:00Z')->>'state', 'written', 'a repeated slot writes again');
select is((select count(*) from private.observability_rollups), 2::bigint, 'repeats converge on the key');
select is((select value from private.observability_rollups where metric = 'requests'), 11::double precision,
  'the newest observation wins');
select is((select watermark from private.observability_source_control where source = 'cloudflare-workers'),
  '2026-11-21T02:15:00Z'::timestamptz, 'the watermark never moves back');
select is((select rows_written from private.observability_daily_writes where source = 'cloudflare-workers'),
  2, 'only inserted rows are charged to the budget');

-- Admin read path: one row per service and metric for a window-long step.
select is(
  (select count(*) from jsonb_array_elements(private.observability_rollup_window(
     '2026-11-21T01:45:00Z', '2026-11-21T03:00:00Z', 2678400)) e
    where e->>'service' = 'tuturuuu-meet' and e->>'metric' = 'requests'),
  1::bigint, 'a window-long step yields one row per metric');
select is(
  (select (e->>'value')::numeric from jsonb_array_elements(private.observability_rollup_window(
     '2026-11-21T01:45:00Z', '2026-11-21T03:00:00Z', 2678400)) e
    where e->>'metric' = 'buckets'),
  1::numeric, 'coverage counts buckets with traffic');
select is(private.observability_rollup_window(
  '2026-10-01T00:00:00Z', '2026-11-21T00:00:00Z', 900), '[]'::jsonb,
  'windows longer than 31 days return nothing');
select ok(not has_function_privilege('authenticated',
  'private.observability_rollup_window(timestamp with time zone,timestamp with time zone,integer,text)', 'execute'),
  'clients cannot read the window');

-- Validation rejects the whole write.
select is(private.observability_write_rollups('cloudflare-workers', 2,
  '[{"service":"tuturuuu-meet","metric":"raw_url","bucket_start":"2026-11-21T02:00:00Z","bucket_seconds":900,"value":1}]',
  '[]', '2026-11-21T02:15:00Z')->>'state', 'invalid', 'an unlisted metric is refused');
select is(private.observability_write_rollups('cloudflare-workers', 2,
  '[{"service":"Bad Name","metric":"requests","bucket_start":"2026-11-21T02:00:00Z","bucket_seconds":900,"value":1}]',
  '[]', '2026-11-21T02:15:00Z')->>'state', 'invalid', 'an invalid service is refused');
select is(private.observability_write_rollups('cloudflare-workers', 2,
  '[{"service":"svc","metric":"requests","bucket_start":"not a time","bucket_seconds":900,"value":1}]',
  '[]', '2026-11-21T02:15:00Z')->>'state', 'invalid', 'an unparsable time is refused');
select is(private.observability_write_rollups('cloudflare-workers', 2,
  (select rollups from fixture_rows), '[]', now() + interval '1 hour')->>'state', 'invalid',
  'a future watermark is refused');

-- Daily row budget: a write that would exceed it rolls back whole.
update private.observability_source_control set daily_row_budget = 1000
 where source = 'cloudflare-workers';
select is(private.observability_write_rollups('cloudflare-workers', 3,
  (select jsonb_agg(jsonb_build_object('service', 'svc-' || n, 'metric', 'requests',
     'bucket_start', '2026-11-21T02:00:00Z', 'bucket_seconds', 900, 'value', n))
     from generate_series(1, 1000) n),
  '[]', '2026-11-21T02:15:00Z')->>'state', 'budget', 'a write past the daily budget is refused');
select is((select count(*) from private.observability_rollups), 2::bigint,
  'a refused budget write leaves no rows');

-- Run log.
select is(private.record_observability_ingest_run('cloudflare-workers', 'on', 'done', 2, 2, 1,
  '2026-11-21T02:00:00Z', '2026-11-21T02:15:00Z'), '{"recorded": 1}'::jsonb, 'a run is recorded');
select is(private.record_observability_ingest_run('unknown-source', 'on', 'done', 0, 0, 0, null, null),
  null::jsonb, 'an unknown source is not recorded');

-- Retention: 15-minute buckets after 90 days, hourly after 400.
insert into private.observability_rollups (source, service, metric, bucket_start, bucket_seconds, value)
values ('cloudflare-workers', 'old', 'requests', now() - interval '100 days', 900, 1),
       ('github-actions', 'old', 'runs', now() - interval '100 days', 3600, 1);
select is(private.prune_observability_rollups(1000)->>'rollups', '1', 'one expired rollup pruned');
select is((select count(*) from private.observability_rollups where service = 'old'), 1::bigint,
  'the hourly rollup is kept');

-- Product analytics: suppression and identifier-free output.
select ok(private.product_analytics_suppressed(1) and private.product_analytics_suppressed(9)
  and not private.product_analytics_suppressed(0) and not private.product_analytics_suppressed(10),
  'cohorts of 1 to 9 are suppressed, zero is not');
-- A one-person feature and an unknown-person feature: every AI cell for
-- the day, including the all-feature total, must be hidden.
insert into public.users (id, display_name)
values ('40000000-0000-4000-8000-000000000001', 'Observability analytics fixture')
on conflict (id) do nothing;
insert into public.workspaces (id, name, creator_id, personal)
values ('40000000-0000-4000-8000-000000000010', 'Observability analytics workspace',
        '40000000-0000-4000-8000-000000000001', false)
on conflict (id) do nothing;
insert into public.workspace_ai_credit_balances (id, ws_id, period_start, period_end)
values ('40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000010',
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month')
on conflict do nothing;
insert into public.ai_credit_transactions (
  ws_id, user_id, balance_id, transaction_type, amount, feature,
  input_tokens, output_tokens, created_at)
values
  ('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000020', 'deduction', -3, 'chat', 100, 50, now()),
  ('40000000-0000-4000-8000-000000000010', null,
   '40000000-0000-4000-8000-000000000020', 'deduction', -2, 'tts', 10, 5, now());

select is(private.rollup_product_analytics_daily(1000)->>'days', '2', 'the rollup covers two days');
select ok(exists (
  select 1 from private.product_analytics_daily
   where day = (now() at time zone 'utc')::date and metric = 'ai_requests'),
  'AI cells exist for the fixture day');
select ok(not exists (
  select 1 from private.product_analytics_daily
   where day = (now() at time zone 'utc')::date
     and metric in ('ai_requests', 'ai_tokens', 'ai_credits', 'ai_users')
     and (not suppressed or value is not null)),
  'small and unknown-person AI cells and their total are hidden');
select ok(not exists (
  select 1 from private.product_analytics_daily
   where dimension in ('chat', 'tts')),
  'small features are folded into other');
select ok(not exists (
  select 1 from private.product_analytics_daily
   where (suppressed and value is not null) or (not suppressed and value is null)),
  'suppressed cells carry no value');

select * from finish();
rollback;
