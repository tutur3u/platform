-- Run against disposable synthetic fixtures only; every benchmark insert rolls back.
-- psql -v size=48000 -v baseline_rpc=list_user_group_activity_logs_baseline -f <this file>
-- Install the pre-change listing under the baseline name from the previous migration
-- before applying the fast-page migrations. The same rows, date window, work_mem,
-- page, and session are used for both variants. Iteration 0 is warm-up; retain 1..5.
-- No cold-cache or production-latency claim is made. PostgreSQL shared buffers are
-- reported in blocks. Keep competing validation serialized through ttr resources.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() !~ '^audit_(takeover|benchmark)_' then
    raise exception 'Run only in a disposable audit_takeover_ or audit_benchmark_ database';
  end if;
end $$;
set local statement_timeout = '180s';
set local work_mem = '4MB';
insert into public.workspace_users (id, ws_id, display_name) values ('22000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'Audit benchmark user');
insert into audit.record_version (record_id, old_record_id, op, table_oid, table_schema, table_name, record, old_record, ts)
select case when entry % 3 <> 1 then md5(entry::text)::uuid end, case when entry % 3 <> 2 then md5(entry::text)::uuid end, case when entry % 3 = 0 then 'UPDATE'::audit.operation when entry % 3 = 1 then 'DELETE'::audit.operation else 'INSERT'::audit.operation end,
 'public.user_feedbacks'::regclass, 'public', 'user_feedbacks',
 case when entry % 3 <> 1 then jsonb_build_object('id', md5(entry::text)::uuid, 'user_id', '22000000-0000-0000-0000-000000000201', 'group_id', null, 'content', repeat('synthetic audit content ', 80)) end,
 case when entry % 3 <> 2 then jsonb_build_object('id', md5(entry::text)::uuid, 'user_id', '22000000-0000-0000-0000-000000000201', 'group_id', null, 'content', repeat('previous audit content ', 80)) end,
 '2026-09-30 00:00Z'::timestamptz - (entry * (interval '28 days' / :size))
from generate_series(1, :size) entry;
analyze audit.record_version;
select set_config('audit.benchmark_baseline_rpc', :'baseline_rpc', true);
create temp table benchmark_results (variant text, iteration int, plan jsonb);
do $$
declare variant text; iteration int; plan jsonb;
begin
 for iteration in 0..5 loop
  foreach variant in array array['baseline','fast'] loop
   execute format('explain (analyze, buffers, format json, timing off) select * from private.%I(''00000000-0000-0000-0000-000000000000'', ''2026-08-31 00:00Z'', ''2026-10-01 00:00Z'', p_limit => 20, p_offset => 20)', case when variant = 'baseline' then current_setting('audit.benchmark_baseline_rpc') else 'list_user_group_activity_logs' end) into plan;
   insert into benchmark_results values (variant, iteration, plan);
  end loop;
 end loop;
end $$;
select jsonb_agg(jsonb_build_object('variant',variant,'iteration',iteration,'ms',plan->0->'Execution Time','rows',plan->0->'Plan'->'Actual Rows','shared_hits',plan->0->'Plan'->'Shared Hit Blocks','temp_reads',plan->0->'Plan'->'Temp Read Blocks','temp_writes',plan->0->'Plan'->'Temp Written Blocks') order by iteration, variant) from benchmark_results;
select not exists ((select * from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000','2026-08-31 00:00Z','2026-10-01 00:00Z',p_query=>'%',p_limit=>20,p_offset=>20) except all select * from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000','2026-08-31 00:00Z','2026-10-01 00:00Z',p_limit=>20,p_offset=>20)) union all (select * from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000','2026-08-31 00:00Z','2026-10-01 00:00Z',p_limit=>20,p_offset=>20) except all select * from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000','2026-08-31 00:00Z','2026-10-01 00:00Z',p_query=>'%',p_limit=>20,p_offset=>20))) as exact_multiset_parity;
rollback;
