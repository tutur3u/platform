-- Synthetic parent/audit cardinality with inline or genuinely TOASTed snapshots.
-- Run only against an isolated disposable fixture seeded with the repository seed.
-- psql -v toast_snapshots=true -f user-group-activity-anchor-extraction.sql
-- One warm-up and five measured samples per variant; all writes roll back.
\if :{?toast_snapshots}
\else
\set toast_snapshots true
\endif
\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() !~ '^audit_(takeover|benchmark)_' then raise exception 'Disposable audit_takeover_ or audit_benchmark_ database only'; end if; end $$;
set local statement_timeout='45s';
set local work_mem='4MB';
insert into public.workspace_users(id,ws_id,display_name)
select md5('resolution-user-'||i)::uuid,case when i<=4000 then '00000000-0000-0000-0000-000000000000'::uuid else '00000000-0000-0000-0000-000000000001'::uuid end,'Synthetic user' from generate_series(1,5626)i;
insert into public.workspace_user_groups(id,ws_id,name)
select md5('resolution-group-'||i)::uuid,case when i<=60 then '00000000-0000-0000-0000-000000000000'::uuid else '00000000-0000-0000-0000-000000000001'::uuid end,'Synthetic group' from generate_series(1,93)i;
insert into private.user_group_posts(id,group_id,title)
select md5('resolution-post-'||i)::uuid,md5('resolution-group-'||(1+i%93))::uuid,'Synthetic post' from generate_series(1,9515)i;
insert into public.user_group_metrics(id,ws_id,group_id,name,unit)
select md5('resolution-metric-'||i)::uuid,case when 1+i%93<=60 then '00000000-0000-0000-0000-000000000000'::uuid else '00000000-0000-0000-0000-000000000001'::uuid end,md5('resolution-group-'||(1+i%93))::uuid,'Synthetic metric','points' from generate_series(1,1816)i;
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,updated_at)
select md5('resolution-report-'||i)::uuid,md5('resolution-user-'||(case when 1+i%93<=60 then 1+i%4000 else 4001+i%1626 end))::uuid,md5('resolution-group-'||(1+i%93))::uuid,'Synthetic report','','',now() from generate_series(1,12044)i;
create temp table synthetic_payload as select case when :toast_snapshots then string_agg(md5(i::text),'') else repeat('Synthetic snapshot ',100) end as payload from generate_series(1,200)i;
with synthetic_records as (
select i,md5('resolution-audit-'||i)::uuid as row_id,
 case i%4 when 0 then 'public.user_feedbacks'::regclass when 1 then 'public.user_group_attendance'::regclass when 2 then 'private.user_group_post_logs'::regclass else 'private.external_user_monthly_report_logs'::regclass end as table_oid,
 case when i%4<2 then 'public' else 'private' end as table_schema,
 case i%4 when 0 then 'user_feedbacks' when 1 then 'user_group_attendance' when 2 then 'user_group_post_logs' else 'external_user_monthly_report_logs' end as table_name,
 jsonb_build_object('id',md5('resolution-audit-'||i)::uuid,'content',(select payload from synthetic_payload)) ||
 case i%4 when 0 then jsonb_build_object('user_id',md5('resolution-user-'||(1+i%5626))::uuid) when 1 then jsonb_build_object('group_id',md5('resolution-group-'||(1+i%93))::uuid) when 2 then jsonb_build_object('post_id',md5('resolution-post-'||(1+i%9515))::uuid) else jsonb_build_object('report_id',md5('resolution-report-'||(1+i%12044))::uuid) end as snapshot,
 '2026-09-30T00:00Z'::timestamptz-i*(interval '30 days'/72000) as occurred_at from generate_series(1,72000)i
)
insert into audit.record_version(record_id,old_record_id,op,table_oid,table_schema,table_name,record,old_record,ts)
select case when i%3<>1 then row_id end,case when i%3<>2 then row_id end,
 case i%3 when 0 then 'UPDATE'::audit.operation when 1 then 'DELETE'::audit.operation else 'INSERT'::audit.operation end,
 table_oid,table_schema,table_name,case when i%3<>1 then snapshot end,
 case when i%3<>2 then snapshot || jsonb_build_object('previous','synthetic') end,occurred_at from synthetic_records;
-- Unrelated history approximates the global audit cardinality, outside this window.
insert into audit.record_version(record_id,op,table_oid,table_schema,table_name,record,ts)
select md5('resolution-unrelated-'||i)::uuid,'INSERT'::audit.operation,'public.finance_invoice_products'::regclass,'public','finance_invoice_products',jsonb_build_object('id',md5('resolution-unrelated-'||i)::uuid,'content',repeat('Unrelated synthetic history ',50)), '2025-01-01T00:00Z' from generate_series(1,570000)i;
analyze audit.record_version;
analyze public.workspace_users;
analyze public.workspace_user_groups;
analyze private.user_group_posts;
analyze private.external_user_monthly_reports;
analyze public.user_group_metrics;
\ir ../migrations/20260930100000_user_group_activity_narrow_candidates.sql
create temp table before_page as select * from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000','2026-08-31T00:00Z','2026-09-30T00:00Z',p_limit=>20,p_offset=>20);
create temp table before_candidates as select * from private.user_group_activity_candidates('00000000-0000-0000-0000-000000000000','2026-08-31T00:00Z','2026-09-30T00:00Z',null);
create temp table variant_definitions (variant text, definition text);
insert into variant_definitions select 'before', pg_get_functiondef('private.user_group_activity_candidates(uuid,timestamptz,timestamptz,uuid)'::regprocedure);
\ir ../migrations/20260930110000_user_group_activity_anchor_extraction.sql
insert into variant_definitions select 'after', pg_get_functiondef('private.user_group_activity_candidates(uuid,timestamptz,timestamptz,uuid)'::regprocedure);
create temp table benchmark_results (variant text, iteration int, plan jsonb);
do $$ declare iteration int; benchmark_variant text; definition text; plan jsonb; begin
 for iteration in 0..5 loop
  foreach benchmark_variant in array array['before','after'] loop
   select definitions.definition into definition from variant_definitions definitions where definitions.variant=benchmark_variant;
   execute definition;
   execute 'explain (analyze,buffers,format json,timing off) select * from private.list_user_group_activity_logs(''00000000-0000-0000-0000-000000000000'',''2026-08-31T00:00Z'',''2026-09-30T00:00Z'',p_limit=>20,p_offset=>20)' into plan;
   insert into benchmark_results values(benchmark_variant,iteration,plan);
  end loop;
 end loop;
end $$;
select jsonb_agg(jsonb_build_object('variant',variant,'iteration',iteration,'ms',plan->0->'Execution Time','rows',plan->0->'Plan'->'Actual Rows','shared_hits',plan->0->'Plan'->'Shared Hit Blocks','shared_reads',plan->0->'Plan'->'Shared Read Blocks','temp_reads',plan->0->'Plan'->'Temp Read Blocks','temp_writes',plan->0->'Plan'->'Temp Written Blocks') order by iteration,variant) as benchmark_samples from benchmark_results;
select not exists((select * from before_page except all select * from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000','2026-08-31T00:00Z','2026-09-30T00:00Z',p_limit=>20,p_offset=>20)) union all (select * from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000','2026-08-31T00:00Z','2026-09-30T00:00Z',p_limit=>20,p_offset=>20) except all select * from before_page)) as full_page_parity;
select not exists((select * from before_candidates except all select * from private.user_group_activity_candidates('00000000-0000-0000-0000-000000000000','2026-08-31T00:00Z','2026-09-30T00:00Z',null)) union all (select * from private.user_group_activity_candidates('00000000-0000-0000-0000-000000000000','2026-08-31T00:00Z','2026-09-30T00:00Z',null) except all select * from before_candidates)) as candidate_parity;
rollback;
