begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

select is(
  (select command from cron.job where jobname = 'refresh-posts-dashboard'),
  'SELECT private.refresh_posts_dashboard_view();',
  'retained cron resolves the moved private helper'
);
-- Exercise the actual scheduled command, not just the helper's catalog entry.
select lives_ok(
  (select command from cron.job where jobname = 'refresh-posts-dashboard'),
  'scheduled dashboard command refreshes the full-chain materialized view'
);
select is(
  (select schedule from cron.job where jobname = 'refresh-posts-dashboard'),
  '*/10 * * * *', 'dashboard cadence is preserved'
);
select ok(not has_function_privilege('anon', 'private.prune_cron_history(integer)', 'execute'),
  'anonymous callers cannot prune');
select ok(not has_function_privilege('authenticated', 'private.prune_cron_history(integer)', 'execute'),
  'authenticated callers cannot prune');
set local role anon;
select throws_ok('select private.prune_cron_history(1)', '42501', null,
  'anonymous execution is denied');
reset role;
set local role authenticated;
select throws_ok('select private.prune_cron_history(1)', '42501', null,
  'authenticated execution is denied');
reset role;
select ok(has_function_privilege('service_role', 'private.prune_cron_history(integer)', 'execute'),
  'Cloudflare service caller can prune');
select throws_ok('select private.prune_cron_history(0)', '22023',
  'p_limit must be between 1 and 1000', 'zero budget rejected');
select throws_ok('select private.prune_cron_history(1001)', '22023',
  'p_limit must be between 1 and 1000', 'oversized budget rejected');
select throws_ok('select private.prune_cron_history(null)', '22023',
  'p_limit must be between 1 and 1000', 'null budget rejected');

-- Disposable transaction: exclude unrelated history from deterministic counts.
delete from cron.job_run_details;
delete from public.workspace_cron_executions;
insert into public.users (id, display_name) values
  ('b6b41338-0000-4000-8000-000000000003', 'Cron retention owner');
insert into public.workspaces (id, name, creator_id) values
  ('b6b41338-0000-4000-8000-000000000001', 'Cron retention fixture',
   'b6b41338-0000-4000-8000-000000000003');
insert into public.workspace_cron_jobs (id, ws_id, name, schedule, endpoint_url)
values ('b6b41338-0000-4000-8000-000000000002',
  'b6b41338-0000-4000-8000-000000000001', 'fixture', '* * * * *', 'https://example.invalid');
insert into cron.job_run_details (jobid, runid, status, start_time, end_time)
select 999999, n, 'succeeded', now() - interval '9 days', now() - interval '8 days'
from generate_series(1, 3) n;
insert into cron.job_run_details (jobid, runid, status, start_time, end_time)
values (999999, 4, 'failed', now() - interval '8 days', now() - interval '7 days'),
  (999999, 5, 'succeeded', now(), now()),
  (999999, 6, 'running', now() - interval '9 days', null);
insert into public.workspace_cron_executions (job_id, status, start_time, end_time)
select 'b6b41338-0000-4000-8000-000000000002', 'success',
  now() - interval '9 days', now() - interval '8 days'
from generate_series(1, 3);
insert into public.workspace_cron_executions (job_id, status, start_time, end_time)
values ('b6b41338-0000-4000-8000-000000000002', 'error', now() - interval '8 days', now() - interval '7 days'),
  ('b6b41338-0000-4000-8000-000000000002', 'success', now(), now()),
  ('b6b41338-0000-4000-8000-000000000002', 'running', now() - interval '9 days', null);

set local role service_role;
select private.prune_cron_history(2) as summary \gset
reset role;
select is(:'summary'::jsonb, '{"pg_cron_deleted":2,"managed_deleted":2}'::jsonb,
  'one call deletes at most its budget per table as the service caller');
select is(private.prune_cron_history(2), '{"pg_cron_deleted":1,"managed_deleted":1}'::jsonb,
  'later calls progress through the remaining expired rows');
select is(private.prune_cron_history(2), '{"pg_cron_deleted":0,"managed_deleted":0}'::jsonb,
  'repeated completed cleanup is idempotent');
select is((select count(*) from cron.job_run_details), 3::bigint,
  'recent, exact-boundary and unfinished pg_cron runs survive');
select is((select count(*) from public.workspace_cron_executions), 3::bigint,
  'recent, exact-boundary and unfinished managed runs survive');
select ok(to_regclass('public.workspace_cron_executions_retention_idx') is not null,
  'managed history selection has a retention index');
select * from finish();
rollback;
