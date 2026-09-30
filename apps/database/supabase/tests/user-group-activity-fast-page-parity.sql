begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);
set local role service_role;
insert into public.workspace_users(id, ws_id, display_name)
values ('23000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'Fast page fixture');
insert into public.workspace_user_groups(id, ws_id, name)
values ('23000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Fast page group');
insert into private.user_group_posts(id, group_id, title)
values ('23000000-0000-0000-0000-000000000003', '23000000-0000-0000-0000-000000000002', 'Fast page post');
insert into public.user_group_metrics(id, ws_id, group_id, name, unit)
values ('23000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', '23000000-0000-0000-0000-000000000002', 'Fast page metric', 'points');
insert into private.user_group_metric_categories(id, ws_id, name)
values ('23000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'Fast page category');
insert into private.external_user_monthly_reports(id, user_id, group_id, title, content, feedback, updated_at)
values ('23000000-0000-0000-0000-000000000006', '23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000002', 'Fast page report', '', '', now());
reset role;

-- Include every tracked table, all operations, ties, and wide snapshots.
-- Direct group records and parent references exercise different candidate branches.
create temp table fixture_resources(schema_name text, table_name text, parent_key text, parent_id uuid);
insert into fixture_resources values
  ('public', 'workspace_user_groups', 'id', '23000000-0000-0000-0000-000000000002'),
  ('public', 'workspace_user_groups_users', null, null),
  ('public', 'workspace_user_group_tag_groups', null, null),
  ('public', 'workspace_default_included_user_groups', null, null),
  ('public', 'user_group_attendance', null, null),
  ('public', 'user_group_linked_products', null, null),
  ('public', 'user_group_metrics', 'id', '23000000-0000-0000-0000-000000000004'),
  ('public', 'user_feedbacks', null, null),
  ('public', 'workspace_course_modules', null, null),
  ('public', 'workspace_course_module_groups', null, null),
  ('private', 'user_group_posts', 'id', '23000000-0000-0000-0000-000000000003'),
  ('private', 'external_user_monthly_reports', 'id', '23000000-0000-0000-0000-000000000006'),
  ('public', 'user_indicators', 'indicator_id', '23000000-0000-0000-0000-000000000004'),
  ('private', 'user_group_post_logs', 'post_id', '23000000-0000-0000-0000-000000000003'),
  ('private', 'user_group_post_checks', 'post_id', '23000000-0000-0000-0000-000000000003'),
  ('private', 'user_group_metric_category_links', 'metric_id', '23000000-0000-0000-0000-000000000004'),
  ('private', 'external_user_monthly_report_logs', 'report_id', '23000000-0000-0000-0000-000000000006'),
  ('private', 'user_group_metric_categories', 'id', '23000000-0000-0000-0000-000000000005');
insert into audit.record_version(record_id, old_record_id, op, table_oid, table_schema, table_name, record, old_record, ts)
select case when op <> 'DELETE' then row_id end,
  case when op <> 'INSERT' then row_id end, op,
  format('%I.%I', schema_name, table_name)::regclass,
  schema_name, table_name,
  case when op <> 'DELETE' then snapshot end,
  case when op <> 'INSERT' then snapshot || '{"content":"previous"}'::jsonb end,
  '2090-01-15 12:00Z'::timestamptz
from (
  select fixture_resources.*, op, gen_random_uuid() as row_id,
    jsonb_build_object('ws_id', '00000000-0000-0000-0000-000000000000',
      'user_id', '23000000-0000-0000-0000-000000000001',
      'created_by', '23000000-0000-0000-0000-000000000001',
      'content', repeat('synthetic audit ', 120))
    || case when parent_key in ('post_id', 'indicator_id', 'metric_id', 'report_id')
      then jsonb_build_object(parent_key, parent_id)
      else case when table_name = 'user_group_metric_categories' then '{}'::jsonb
        else jsonb_build_object('group_id', '23000000-0000-0000-0000-000000000002') end
        || case when parent_key is not null then jsonb_build_object(parent_key, parent_id) else '{}'::jsonb end
      end as snapshot
  from fixture_resources cross join unnest(array['INSERT', 'UPDATE', 'DELETE']::audit.operation[]) op
) fixture;

select is((select count(*) from private.user_group_activity_candidates(
  '00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', null)),
  54::bigint, 'all 18 resource tables and three operations remain eligible');
select set_eq(
  $$select audit_record_id from private.user_group_activity_candidates('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', null)$$,
  $$select audit_record_id from private.user_group_activity_feed('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', null)$$,
  'candidate identities match full feed across every tracked resource');

-- A wildcard forces the established enriched path and matches all coalesced
-- labels, including empty labels. Compare ordered full rows, not just IDs.
select is(
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => 20, p_offset => 0) row),
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_query => '%', p_limit => 20, p_offset => 0) row),
  'fast and enriched paths agree for limit 20, offset 0');
select is(
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => 7, p_offset => 13) row),
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_query => '%', p_limit => 7, p_offset => 13) row),
  'fast and enriched paths agree for limit 7, offset 13');
select is(
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => 100, p_offset => 0) row),
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_query => '%', p_limit => 100, p_offset => 0) row),
  'fast and enriched paths agree for limit 100, offset 0');
select is(
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => 0, p_offset => -2) row),
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_query => '%', p_limit => 0, p_offset => -2) row),
  'fast and enriched paths agree for limit 0, offset -2');
select is(
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => null, p_offset => null) row),
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_query => '%', p_limit => null, p_offset => null) row),
  'fast and enriched paths agree for limit None, offset None');
select is(
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => 10, p_offset => 1000) row),
  (select coalesce(jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc), '[]'::jsonb)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_query => '%', p_limit => 10, p_offset => 1000) row),
  'fast and enriched paths agree for limit 10, offset 1000');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2090-01-15 12:00Z', '2090-01-15 12:00Z')),
  0::bigint, 'end timestamp is exclusive');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000001', '2090-01-01', '2090-02-01')),
  0::bigint, 'another workspace cannot see fixture history');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_action => 'created')),
  18::bigint, 'action filters run before paging');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_resource_type => 'feedback')),
  3::bigint, 'resource filters run before paging');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_affected_user_query => 'missing fixture user')),
  0::bigint, 'affected-user filters preserve empty results');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_actor_query => 'missing fixture actor')),
  0::bigint, 'actor filters preserve empty results');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_group_id => '23000000-0000-0000-0000-000000000002')),
  51::bigint, 'group filtering excludes workspace-wide metric categories');

-- The legacy fallback actor join can multiply rows when several platform users
-- link to one virtual user. The listing must retain both count and pagination.
set local role service_role;
insert into public.workspace_user_linked_users(platform_user_id, ws_id, virtual_user_id)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', '23000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', '23000000-0000-0000-0000-000000000001')
on conflict (platform_user_id, ws_id) do update set virtual_user_id = excluded.virtual_user_id;
reset role;
select is((select max(total_count) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => 1)),
  -- INSERT/DELETE snapshots retain created_by (36 * 2); UPDATE snapshots
  -- contain only the changed content, so those 18 rows have no fallback join.
  90::bigint, 'multiple fallback links retain the established row count');
select is(
  (select jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc, actor_email)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => 8, p_offset => 12) row),
  (select jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc, actor_email)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_query => '%', p_limit => 8, p_offset => 12) row),
  'multiple fallback links retain enriched pagination and actor contents');
set local role service_role;
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', p_limit => 1)),
  1::bigint, 'service role can execute the listing with the same result contract');
reset role;

set local role authenticated;
select throws_ok($$select * from private.user_group_activity_candidates('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', null)$$,
  '42501', 'permission denied for schema private', 'authenticated cannot invoke internal candidates');
reset role;
set local role anon;
select throws_ok($$select * from private.user_group_activity_feed_for_ids('00000000-0000-0000-0000-000000000000', '2090-01-01', '2090-02-01', null, array[1]::bigint[])$$,
  '42501', 'permission denied for schema private', 'anon cannot invoke page enrichment');
reset role;

select ok(not exists (
  select 1 from private.user_group_activity_feed_for_ids('00000000-0000-0000-0000-000000000001', '2090-01-01', '2090-02-01', null,
    (select array_agg(id) from audit.record_version where ts = '2090-01-15 12:00Z'))
), 'caller-supplied page IDs cannot cross workspace boundaries');

-- A virtual fallback actor can belong to another workspace (intentionally
-- supported by the richer actor fallback). Its links still multiply feed rows.
set local role service_role;
delete from public.workspace_user_linked_users
where virtual_user_id = '23000000-0000-0000-0000-000000000001';
insert into public.workspace_users(id, ws_id, display_name)
values ('23000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Cross-workspace actor');
insert into public.workspace_user_linked_users(platform_user_id, ws_id, virtual_user_id)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000012')
on conflict (platform_user_id, ws_id) do update set virtual_user_id = excluded.virtual_user_id;
reset role;
insert into audit.record_version(record_id, op, table_oid, table_schema, table_name, record, ts)
values ('23000000-0000-0000-0000-000000000013', 'INSERT', 'public.user_feedbacks'::regclass, 'public', 'user_feedbacks',
  '{"id":"23000000-0000-0000-0000-000000000013","user_id":"23000000-0000-0000-0000-000000000001","creator_id":"23000000-0000-0000-0000-000000000012","content":"Cross-workspace actor fixture"}', '2091-01-15 12:00Z');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2091-01-01', '2091-02-01', p_limit => 1)),
  1::bigint, 'cross-workspace actor links do not exceed the page limit');
select is((select max(total_count) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2091-01-01', '2091-02-01', p_limit => 1, p_offset => 1)),
  2::bigint, 'cross-workspace actor links retain total count and second page');
select is(
  (select jsonb_agg(to_jsonb(row) order by actor_email)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2091-01-01', '2091-02-01', p_limit => 10) row),
  (select jsonb_agg(to_jsonb(row) order by actor_email)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000', '2091-01-01', '2091-02-01', p_query => '%', p_limit => 10) row),
  'cross-workspace actor contents and multiplicity match the enriched path');
select * from finish();
rollback;
