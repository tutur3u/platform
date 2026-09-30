begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);
set local role service_role;
insert into public.workspace_users(id, ws_id, display_name)
values ('24000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'Anchor fixture user');
reset role;

-- JSON text coercion, invalid-current/valid-old fallback, and explicit workspace
-- precedence must match the legacy feed. These snapshots are synthetic only.
create temp table anchor_cases(case_id integer, current_ws jsonb, previous_ws jsonb);
insert into anchor_cases values
  (1, to_jsonb('00000000-0000-0000-0000-000000000000'::text), null),
  (2, to_jsonb('00000000-0000-0000-0000-000000000001'::text), null),
  (3, to_jsonb('invalid uuid'::text), to_jsonb('00000000-0000-0000-0000-000000000000'::text)),
  (4, to_jsonb('00000000000000000000000000000000'::text), null),
  (5, '{"nested":"invalid"}'::jsonb, to_jsonb('00000000-0000-0000-0000-000000000000'::text)),
  (6, '[]'::jsonb, to_jsonb('00000000-0000-0000-0000-000000000000'::text)),
  (7, 'true'::jsonb, to_jsonb('00000000-0000-0000-0000-000000000000'::text)),
  (8, 'null'::jsonb, to_jsonb('00000000-0000-0000-0000-000000000001'::text));
insert into audit.record_version(record_id, old_record_id, op, table_oid, table_schema, table_name, record, old_record, ts)
select md5('anchor-case-' || case_id)::uuid, md5('anchor-case-' || case_id)::uuid,
  'UPDATE'::audit.operation, 'public.user_feedbacks'::regclass, 'public', 'user_feedbacks',
  jsonb_build_object('id', md5('anchor-case-' || case_id)::uuid,
    'user_id', '24000000-0000-0000-0000-000000000001', 'ws_id', current_ws,
    'content', 'new synthetic content'),
  jsonb_build_object('id', md5('anchor-case-' || case_id)::uuid,
    'user_id', '24000000-0000-0000-0000-000000000001', 'ws_id', previous_ws,
    'content', 'previous synthetic content'),
  '2093-01-15T00:00Z'::timestamptz + case_id * interval '1 minute'
from anchor_cases;

select is((select count(*) from private.user_group_activity_candidates(
  '00000000-0000-0000-0000-000000000000', '2093-01-01', '2093-02-01', null)),
  6::bigint, 'candidate count preserves snapshot workspace precedence and fallback');
select ok(not exists(
  (select audit_record_id, occurred_at from private.user_group_activity_candidates(
    '00000000-0000-0000-0000-000000000000', '2093-01-01', '2093-02-01', null)
   except all select audit_record_id, occurred_at from private.user_group_activity_feed(
    '00000000-0000-0000-0000-000000000000', '2093-01-01', '2093-02-01', null))
  union all
  (select audit_record_id, occurred_at from private.user_group_activity_feed(
    '00000000-0000-0000-0000-000000000000', '2093-01-01', '2093-02-01', null)
   except all select audit_record_id, occurred_at from private.user_group_activity_candidates(
    '00000000-0000-0000-0000-000000000000', '2093-01-01', '2093-02-01', null))
), 'all candidate identities equal the unchanged full feed');
select is(
  (select jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000',
    '2093-01-01', '2093-02-01', p_limit => 2, p_offset => 0) row),
  (select jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000',
    '2093-01-01', '2093-02-01', p_query => '%', p_limit => 2, p_offset => 0) row),
  'first page matches enriched path including full payload and exact total');
select is(
  (select jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000',
    '2093-01-01', '2093-02-01', p_limit => 2, p_offset => 2) row),
  (select jsonb_agg(to_jsonb(row) order by occurred_at desc, audit_record_id desc)
   from private.list_user_group_activity_logs('00000000-0000-0000-0000-000000000000',
    '2093-01-01', '2093-02-01', p_query => '%', p_limit => 2, p_offset => 2) row),
  'offset page matches enriched path');
select is((select max(total_count) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2093-01-01', '2093-02-01', p_limit => 2)),
  6::bigint, 'page retains exact count before limit');
select is((select count(*) from private.user_group_activity_candidates(
  '00000000-0000-0000-0000-000000000000', '2093-01-15T00:04Z', '2093-01-15T00:05Z', null)),
  1::bigint, 'noncanonical valid UUID remains supported and end is exclusive');
select is((select count(*) from private.user_group_activity_candidates(
  '00000000-0000-0000-0000-000000000000', '2093-01-15T00:05Z', '2093-01-15T00:08Z', null)),
  3::bigint, 'object array and boolean anchor text retain invalid UUID fallback');
select is((select count(*) from private.user_group_activity_candidates(
  '00000000-0000-0000-0000-000000000000', '2093-01-15T00:02Z', '2093-01-15T00:03Z', null)),
  0::bigint, 'explicit foreign workspace wins over affected user workspace');
select is((select count(*) from private.user_group_activity_candidates(
  '00000000-0000-0000-0000-000000000000', '2093-01-15T00:08Z', '2093-01-15T00:09Z', null)),
  0::bigint, 'JSON null falls back to foreign old workspace instead of affected user');
select is((select count(*) from private.list_user_group_activity_logs(
  '00000000-0000-0000-0000-000000000000', '2093-01-01', '2093-02-01', p_limit => 2, p_offset => 20)),
  0::bigint, 'offset beyond the feed stays empty');
select * from finish();
rollback;
