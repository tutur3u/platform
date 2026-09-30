begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

set local role service_role;

insert into public.workspace_users (id, ws_id, display_name)
values (
  '20000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000000',
  'Audit candidate test user'
);

insert into private.user_group_metric_categories (id, ws_id, name)
values (
  '20000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000000',
  'Audit candidate test category'
);

reset role;

-- These historical rows lack a current group or metric parent. Their user or
-- category is the only remaining workspace anchor.
insert into audit.record_version (
  record_id, op, table_oid, table_schema, table_name, record, ts
) values
  (
    '20000000-0000-0000-0000-000000000203',
    'INSERT', 'public.user_feedbacks'::regclass, 'public', 'user_feedbacks',
    '{"id":"20000000-0000-0000-0000-000000000203","user_id":"20000000-0000-0000-0000-000000000201","group_id":null,"content":"audit candidate"}'::jsonb,
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000204',
    'INSERT', 'public.user_indicators'::regclass, 'public', 'user_indicators',
    '{"user_id":"20000000-0000-0000-0000-000000000201","indicator_id":"20000000-0000-0000-0000-000000000204","value":"1"}'::jsonb,
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000205',
    'INSERT', 'private.user_group_metric_category_links'::regclass,
    'private', 'user_group_metric_category_links',
    '{"metric_id":"20000000-0000-0000-0000-000000000205","category_id":"20000000-0000-0000-0000-000000000202"}'::jsonb,
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000206',
    'INSERT', 'public.user_feedbacks'::regclass, 'public', 'user_feedbacks',
    '{"id":"20000000-0000-0000-0000-000000000206","user_id":"20000000-0000-0000-0000-000000000201","group_id":null,"content":"audit candidate older"}'::jsonb,
    now() - interval '1 minute'
  );

select ok(
  exists (
    select 1 from private.user_group_activity_feed(
      '00000000-0000-0000-0000-000000000000',
      now() - interval '1 hour', now() + interval '1 hour', null::uuid
    ) where table_name = 'user_feedbacks'
      and resource_id = '20000000-0000-0000-0000-000000000203'
  ),
  'workspace user candidates retain feedback without a group'
);

select ok(
  exists (
    select 1 from private.user_group_activity_feed(
      '00000000-0000-0000-0000-000000000000',
      now() - interval '1 hour', now() + interval '1 hour', null::uuid
    ) where table_name = 'user_indicators'
      and audit_record_id in (
        select id from audit.record_version
        where record_id = '20000000-0000-0000-0000-000000000204'
      )
  ),
  'workspace user candidates retain indicator history after metric deletion'
);

select ok(
  exists (
    select 1 from private.user_group_activity_feed(
      '00000000-0000-0000-0000-000000000000',
      now() - interval '1 hour', now() + interval '1 hour', null::uuid
    ) where table_name = 'user_group_metric_category_links'
      and audit_record_id in (
        select id from audit.record_version
        where record_id = '20000000-0000-0000-0000-000000000205'
      )
  ),
  'workspace category candidates retain links after metric deletion'
);

select ok(
  not exists (
    select 1 from private.user_group_activity_feed(
      '20000000-0000-0000-0000-000000000209',
      now() - interval '1 hour', now() + interval '1 hour', null::uuid
    ) where table_name in (
      'user_feedbacks', 'user_indicators', 'user_group_metric_category_links'
    )
  ),
  'workspace candidates do not expose another workspace history'
);

select ok(
  not exists (
    select 1 from private.user_group_activity_feed(
      '00000000-0000-0000-0000-000000000000',
      now() - interval '1 hour', now() + interval '1 hour',
      '20000000-0000-0000-0000-000000000209'
    ) where table_name in (
      'user_feedbacks', 'user_indicators', 'user_group_metric_category_links'
    )
  ),
  'group-scoped candidates exclude ungrouped history'
);

select is(
  (select resource_id from private.list_user_group_activity_logs(
    '00000000-0000-0000-0000-000000000000',
    now() - interval '1 hour', now() + interval '1 hour',
    p_resource_type => 'feedback',
    p_affected_user_query => 'Audit candidate test user',
    p_limit => 1, p_offset => 0
  )),
  '20000000-0000-0000-0000-000000000203'::uuid,
  'listing RPC returns the newest matching event first'
);

select is(
  (select resource_id::text || ':' || total_count::text
   from private.list_user_group_activity_logs(
    '00000000-0000-0000-0000-000000000000',
    now() - interval '1 hour', now() + interval '1 hour',
    p_resource_type => 'feedback',
    p_affected_user_query => 'Audit candidate test user',
    p_limit => 1, p_offset => 1
  )),
  '20000000-0000-0000-0000-000000000206:2',
  'listing RPC keeps descending pagination and the exact count'
);

select set_eq(
  $$select audit_record_id from private.user_group_activity_candidates(
    '00000000-0000-0000-0000-000000000000',
    now() - interval '1 hour', now() + interval '1 hour', null::uuid
  )$$,
  $$select audit_record_id from private.user_group_activity_feed(
    '00000000-0000-0000-0000-000000000000',
    now() - interval '1 hour', now() + interval '1 hour', null::uuid
  )$$,
  'narrow candidates match every eligible full-feed row'
);

select is(
  (select count(distinct audit_record_id) from private.user_group_activity_candidates(
    '00000000-0000-0000-0000-000000000000',
    now() - interval '1 hour', now() + interval '1 hour', null::uuid
  )),
  (select count(*) from private.user_group_activity_candidates(
    '00000000-0000-0000-0000-000000000000',
    now() - interval '1 hour', now() + interval '1 hour', null::uuid
  )),
  'candidate branches do not duplicate audit IDs'
);

select ok(
  not exists (
    select 1 from private.list_user_group_activity_logs(
      '00000000-0000-0000-0000-000000000000',
      now() - interval '1 hour', now() + interval '1 hour',
      p_limit => 2, p_offset => 1
    ) listed
    full join (
      select feed.*, count(*) over () as total_count
      from private.user_group_activity_feed(
        '00000000-0000-0000-0000-000000000000',
        now() - interval '1 hour', now() + interval '1 hour', null::uuid
      ) feed
      order by occurred_at desc, audit_record_id desc
      limit 2 offset 1
    ) expected using (audit_record_id)
    where listed is distinct from expected
  ),
  'fast page preserves full feed content and exact count at an offset'
);

select is(
  (select count(*) from private.list_user_group_activity_logs(
    '20000000-0000-0000-0000-000000000209',
    now() - interval '1 hour', now() + interval '1 hour',
    p_limit => 20, p_offset => 0
  )),
  0::bigint,
  'fast page respects workspace isolation'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.user_group_activity_candidates(uuid,timestamptz,timestamptz,uuid)',
    'EXECUTE'
  ),
  'narrow audit candidates are not callable by anon'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.user_group_activity_feed_for_ids(uuid,timestamptz,timestamptz,uuid,bigint[])',
    'EXECUTE'
  ),
  'page enrichment is not callable by authenticated clients'
);

select * from finish();
rollback;
