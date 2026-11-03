-- AI Studio retention schedule: the counts-only preview, the bounded batch and
-- the counts-only run log behind the Cron Control job `ai-studio-retention`.
-- Synthetic rows only; the Easy Center id is a disposable fixture here.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select plan(56);

-- Grants: service_role only; anon and authenticated are denied.
select ok(has_function_privilege('service_role', 'private.count_ai_studio_retention()', 'execute'),
  'service caller can count');
select ok(has_function_privilege('service_role', 'private.cleanup_ai_studio_retention_batch(integer)', 'execute'),
  'service caller can run a batch');
select ok(has_function_privilege('service_role',
  'private.record_ai_studio_retention_run(text,text,integer,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint)', 'execute'),
  'service caller can record a run');
select ok(not has_function_privilege('anon', 'private.count_ai_studio_retention()', 'execute')
  and not has_function_privilege('authenticated', 'private.count_ai_studio_retention()', 'execute'),
  'clients cannot count');
select ok(not has_function_privilege('anon', 'private.cleanup_ai_studio_retention_batch(integer)', 'execute')
  and not has_function_privilege('authenticated', 'private.cleanup_ai_studio_retention_batch(integer)', 'execute'),
  'clients cannot delete');
select ok(not has_function_privilege('anon',
  'private.record_ai_studio_retention_run(text,text,integer,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint)', 'execute')
  and not has_function_privilege('authenticated',
  'private.record_ai_studio_retention_run(text,text,integer,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint)', 'execute'),
  'clients cannot write the run log');
select ok(not has_function_privilege('anon', 'private.ai_studio_metadata_cutoff(integer,timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'private.ai_studio_metadata_cutoff(integer,timestamp with time zone)', 'execute'),
  'clients cannot call the cutoff helper');
set local role authenticated;
select throws_ok('select private.cleanup_ai_studio_retention_batch(1)', '42501', null,
  'authenticated execution is denied');
reset role;
select ok(not has_table_privilege('anon', 'private.ai_studio_retention_runs', 'select')
  and not has_table_privilege('authenticated', 'private.ai_studio_retention_runs', 'select'),
  'clients cannot read the run log');

-- Hardening: invoker rights, pinned search path, no dynamic SQL.
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in ('count_ai_studio_retention',
      'cleanup_ai_studio_retention_batch', 'record_ai_studio_retention_run',
      'ai_studio_metadata_cutoff')
      and not p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog, pg_temp']),
  4, 'all four functions are SECURITY INVOKER with a pinned search_path');
select ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in ('count_ai_studio_retention',
      'cleanup_ai_studio_retention_batch', 'record_ai_studio_retention_run')
      and p.prosrc ~* '\mexecute\M'),
  'no dynamic SQL');
select is(provolatile::text, 's', 'the preview is STABLE (read-only)')
  from pg_proc where oid = 'private.count_ai_studio_retention()'::regprocedure;

-- The cutoff is never inside the current calendar month, so a short workspace
-- policy cannot shrink the monthly credit-budget sum.
select is(private.ai_studio_metadata_cutoff(365, '2026-11-03 19:43:00+00'),
  '2025-11-03 19:43:00+00'::timestamptz, '365-day cutoff is exactly now - 365 days');
select is(private.ai_studio_metadata_cutoff(30, '2026-10-31 12:00:00+00'),
  '2026-10-01 00:00:00+00'::timestamptz, 'a 30-day policy never reaches into the current month');
select is(private.ai_studio_metadata_cutoff(30, '2026-11-03 12:00:00+00'),
  '2026-10-04 12:00:00+00'::timestamptz, 'a 30-day policy is exact when the month is younger');

select throws_ok('select private.cleanup_ai_studio_retention_batch(0)', '22023',
  'p_limit must be between 1 and 1000', 'zero budget rejected');
select throws_ok('select private.cleanup_ai_studio_retention_batch(1001)', '22023',
  'p_limit must be between 1 and 1000', 'oversized budget rejected');
select throws_ok('select private.cleanup_ai_studio_retention_batch(null)', '22023',
  'p_limit must be between 1 and 1000', 'null budget rejected');

-- Fixtures: A inherits the 365-day default, B overrides 30 days, EC is excluded.
update private.ai_studio_global_settings set metadata_retention_days = 365 where singleton;
insert into public.users (id, display_name) values
  ('a15e0000-0000-4000-8000-000000000001', 'AI retention owner');
insert into public.workspaces (id, name, creator_id) values
  ('a15e0000-0000-4000-8000-0000000000a1', 'AI retention default', 'a15e0000-0000-4000-8000-000000000001'),
  ('a15e0000-0000-4000-8000-0000000000b1', 'AI retention override', 'a15e0000-0000-4000-8000-000000000001'),
  ('42529372-c669-4833-bb32-2cab1f4ffd83', 'Easy Center retention fixture', 'a15e0000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into private.workspace_ai_studio_policies (ws_id, metadata_retention_days)
values ('a15e0000-0000-4000-8000-0000000000b1', 30)
on conflict (ws_id) do update set metadata_retention_days = 30;

create temporary table fixture_runs (id uuid, ws text, age interval, status text) on commit drop;
insert into fixture_runs values
  ('a15e0000-0000-4000-8000-00000000a001', 'a', interval '400 days', 'succeeded'),
  ('a15e0000-0000-4000-8000-00000000a002', 'a', interval '366 days', 'failed'),
  ('a15e0000-0000-4000-8000-00000000a003', 'a', interval '370 days', 'reserved'),
  ('a15e0000-0000-4000-8000-00000000a004', 'a', interval '364 days', 'succeeded'),
  ('a15e0000-0000-4000-8000-00000000a005', 'a', interval '1 day', 'succeeded'),
  ('a15e0000-0000-4000-8000-00000000b001', 'b', interval '45 days', 'succeeded'),
  ('a15e0000-0000-4000-8000-00000000b002', 'b', interval '10 days', 'succeeded'),
  ('a15e0000-0000-4000-8000-00000000e001', 'e', interval '400 days', 'succeeded');
insert into private.ai_studio_runs (id, request_id, ws_id, model_id, feature, status, created_at)
select f.id, 'ai-retention-' || f.id, case f.ws
    when 'a' then 'a15e0000-0000-4000-8000-0000000000a1'::uuid
    when 'b' then 'a15e0000-0000-4000-8000-0000000000b1'::uuid
    else '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid end,
  'fixture/model', 'fixture', f.status, now() - f.age
from fixture_runs f;

-- Content: two expired (a001, a005), one not yet expired on a due run (a002),
-- one live (a004), and an expired Easy Center row that must survive.
insert into private.ai_studio_run_content (run_id, prompt, output, expires_at) values
  ('a15e0000-0000-4000-8000-00000000a001', '{"p":"secret prompt"}', '{"o":"secret output"}', now() - interval '370 days'),
  ('a15e0000-0000-4000-8000-00000000a005', '{"p":"secret prompt"}', null, now() - interval '1 hour'),
  ('a15e0000-0000-4000-8000-00000000a002', '{"p":"secret prompt"}', null, now() + interval '1 day'),
  ('a15e0000-0000-4000-8000-00000000a004', '{"p":"secret prompt"}', null, now() + interval '1 day'),
  ('a15e0000-0000-4000-8000-00000000e001', '{"p":"secret prompt"}', null, now() - interval '30 days');
insert into private.ai_studio_run_steps (run_id, sequence, kind, name, status) values
  ('a15e0000-0000-4000-8000-00000000a001', 0, 'model', 'step', 'succeeded'),
  ('a15e0000-0000-4000-8000-00000000a001', 1, 'tool', 'step', 'succeeded'),
  ('a15e0000-0000-4000-8000-00000000a002', 0, 'model', 'step', 'failed'),
  ('a15e0000-0000-4000-8000-00000000a004', 0, 'model', 'step', 'succeeded');
insert into private.ai_studio_usage (run_id, ws_id, model_id, feature, billed_credits)
select f.id, r.ws_id, 'fixture/model', 'fixture', 1
from fixture_runs f join private.ai_studio_runs r on r.id = f.id
where f.id in ('a15e0000-0000-4000-8000-00000000a001', 'a15e0000-0000-4000-8000-00000000b001',
  'a15e0000-0000-4000-8000-00000000a004', 'a15e0000-0000-4000-8000-00000000e001');
insert into private.ai_studio_evaluation_suites (id, ws_id, name)
values ('a15e0000-0000-4000-8000-00000000c001', 'a15e0000-0000-4000-8000-0000000000a1', 'suite');
insert into private.ai_studio_experiments (id, ws_id, suite_id, name, target_type)
values ('a15e0000-0000-4000-8000-00000000c002', 'a15e0000-0000-4000-8000-0000000000a1',
  'a15e0000-0000-4000-8000-00000000c001', 'experiment', 'model');
insert into private.ai_studio_evaluation_results (id, experiment_id, run_id, grader_name)
values ('a15e0000-0000-4000-8000-00000000c003', 'a15e0000-0000-4000-8000-00000000c002',
  'a15e0000-0000-4000-8000-00000000a001', 'grader');
-- A credit ledger row that names a run in metadata only (no FK): never touched.
create temporary table ledger_before on commit drop as
  select count(*) as n from public.ai_credit_transactions;

-- Preview: counts and timestamps only, read-only, as the service caller.
-- Ignore any pre-existing seed rows: compare against a baseline taken first.
set local role service_role;
select private.count_ai_studio_retention() as preview \gset
reset role;
select is((:'preview'::jsonb ->> 'content_rows')::integer, 2,
  'preview counts the two expired non-EC content rows');
select is((:'preview'::jsonb ->> 'run_rows')::integer, 3,
  'preview counts a001, a002 (365-day default) and b001 (30-day override)');
select is((:'preview'::jsonb ->> 'cascade_content_rows')::integer, 1,
  'preview counts unexpired content that goes with a due run');
select is((:'preview'::jsonb ->> 'step_rows')::integer, 3, 'preview counts cascaded steps');
select is((:'preview'::jsonb ->> 'usage_rows')::integer, 2, 'preview counts cascaded usage rows');
select is((:'preview'::jsonb ->> 'evaluation_links')::integer, 1,
  'preview counts evaluation links that will be cleared');
select is((:'preview'::jsonb ->> 'held_in_flight_runs')::integer, 1,
  'an old reserved run is held, not deleted');
select is((:'preview'::jsonb ->> 'held_current_month_runs')::integer, 0,
  'nothing is held for the current month in this fixture');
select is((:'preview'::jsonb ->> 'global_retention_days')::integer, 365, 'preview reports the default');
select ok((:'preview'::jsonb ->> 'workspace_overrides')::integer >= 1, 'preview reports overrides');
select is((:'preview'::jsonb ->> 'run_oldest')::timestamptz,
  (select created_at from private.ai_studio_runs where id = 'a15e0000-0000-4000-8000-00000000a001'),
  'oldest due run timestamp');
select is((:'preview'::jsonb ->> 'run_newest')::timestamptz,
  (select created_at from private.ai_studio_runs where id = 'a15e0000-0000-4000-8000-00000000b001'),
  'newest due run timestamp');
select is((:'preview'::jsonb ->> 'cutoff_oldest')::timestamptz, now() - interval '365 days',
  'the oldest cutoff used is now - 365 days');
select ok((:'preview'::jsonb ->> 'cutoff_newest')::timestamptz <= now() - interval '30 days',
  'the newest cutoff used is at least 30 days old');
select ok(:'preview' !~ 'secret' and :'preview' !~ 'fixture/model'
  and :'preview' !~ 'a15e0000' and :'preview' !~ '42529372',
  'preview carries no content, model, run or workspace identifiers');
select is((select count(*)::integer from private.ai_studio_runs where request_id like 'ai-retention-%'), 8,
  'the preview deleted nothing');

-- Batch: at most p_limit rows per table per call, oldest first.
set local role service_role;
select private.cleanup_ai_studio_retention_batch(1) as b1 \gset
reset role;
select is(:'b1'::jsonb, jsonb_build_object('state', 'more', 'content_rows', 1, 'run_rows', 1,
  'cascade_content_rows', 0, 'step_rows', 2, 'usage_rows', 1, 'evaluation_links', 1),
  'first batch deletes one content row and the oldest due run with its cascade');
select ok(not exists (select 1 from private.ai_studio_runs where id = 'a15e0000-0000-4000-8000-00000000a001'),
  'the oldest run went first');
select is((select run_id from private.ai_studio_evaluation_results
  where id = 'a15e0000-0000-4000-8000-00000000c003'), null::uuid,
  'evaluation result survives with its run link cleared');
set local role service_role;
select private.cleanup_ai_studio_retention_batch(1) as b2 \gset
select private.cleanup_ai_studio_retention_batch(1) as b3 \gset
select private.cleanup_ai_studio_retention_batch(1) as b4 \gset
reset role;
select is(:'b2'::jsonb ->> 'run_rows', '1', 'second batch honours the limit');
select is(:'b2'::jsonb ->> 'cascade_content_rows', '1', 'unexpired content of a due run cascades');
select is(:'b3'::jsonb ->> 'run_rows', '1', 'third batch reaches the override workspace');
select is(:'b4'::jsonb, jsonb_build_object('state', 'done', 'content_rows', 0, 'run_rows', 0,
  'cascade_content_rows', 0, 'step_rows', 0, 'usage_rows', 0, 'evaluation_links', 0),
  'a completed cleanup is an idempotent no-op');
select ok(:'b1' !~ 'secret' and :'b2' !~ 'secret' and :'b1' !~ 'a15e0000',
  'batch summaries carry counts only');

select is(
  (select array_agg(id order by id) from private.ai_studio_runs where request_id like 'ai-retention-%'),
  array['a15e0000-0000-4000-8000-00000000a003', 'a15e0000-0000-4000-8000-00000000a004',
    'a15e0000-0000-4000-8000-00000000a005', 'a15e0000-0000-4000-8000-00000000b002',
    'a15e0000-0000-4000-8000-00000000e001']::uuid[],
  'in-flight, newer-than-365-day, recent, newer-than-override and Easy Center runs survive');
select is((select count(*)::integer from private.ai_studio_run_content
  where run_id = 'a15e0000-0000-4000-8000-00000000e001'), 1,
  'expired Easy Center content is never deleted');
select is((select count(*)::integer from private.ai_studio_run_content
  where run_id = 'a15e0000-0000-4000-8000-00000000a005'), 0,
  'expired content of a recent run is deleted, its run kept');
select is((select count(*)::integer from private.ai_studio_run_content
  where run_id = 'a15e0000-0000-4000-8000-00000000a004'), 1, 'unexpired content is kept');
select is((select count(*)::integer from private.ai_studio_usage
  where run_id in ('a15e0000-0000-4000-8000-00000000a004', 'a15e0000-0000-4000-8000-00000000e001')), 2,
  'usage rows of kept runs are kept');
select is((select count(*) from public.ai_credit_transactions), (select n from ledger_before),
  'the credit ledger is untouched');

-- Larger limit drains in one call; preview then reports nothing left.
set local role service_role;
select private.count_ai_studio_retention() as after \gset
reset role;
select is((:'after'::jsonb ->> 'run_rows')::integer + (:'after'::jsonb ->> 'content_rows')::integer, 0,
  'nothing due remains');
select ok(:'after'::jsonb ? 'run_oldest' and (:'after'::jsonb -> 'run_oldest') = 'null'::jsonb,
  'empty preview reports null timestamps');

-- Run log: counts only.
set local role service_role;
select private.record_ai_studio_retention_run('delete', 'done', 4, 2, 3, 1, 3, 2, 1, null, null) as rec \gset
reset role;
select is(:'rec'::jsonb, '{"recorded": 1}'::jsonb, 'run log accepts counts');
select is(
  (select array_agg(column_name::text order by column_name)
    from information_schema.columns
    where table_schema = 'private' and table_name = 'ai_studio_retention_runs'
      and data_type not in ('bigint', 'integer', 'timestamp with time zone', 'uuid')),
  array['mode', 'status'], 'the only text columns are the constrained mode and status');
select throws_ok($$select private.record_ai_studio_retention_run('purge', 'done', 0, 0, 0, 0, 0, 0, 0, null, null)$$,
  '23514', null, 'unknown modes are rejected');
select throws_ok($$select private.record_ai_studio_retention_run('delete', 'done', 0, -1, 0, 0, 0, 0, 0, null, null)$$,
  '23514', null, 'negative counts are rejected');
select is((select content_rows from private.ai_studio_retention_runs order by recorded_at desc limit 1), 2::bigint,
  'the run log keeps the counts');

-- The original cleanup keeps its signature and grants.
select ok(has_function_privilege('service_role', 'private.cleanup_ai_studio_retention()', 'execute')
  and not has_function_privilege('authenticated', 'private.cleanup_ai_studio_retention()', 'execute'),
  'the original unbounded cleanup is unchanged and service-only');

select * from finish();
rollback;
