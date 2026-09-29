begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

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
  record_id, op, table_oid, table_schema, table_name, record
) values
  (
    '20000000-0000-0000-0000-000000000203',
    'INSERT', 'public.user_feedbacks'::regclass, 'public', 'user_feedbacks',
    '{"id":"20000000-0000-0000-0000-000000000203","user_id":"20000000-0000-0000-0000-000000000201","group_id":null,"content":"audit candidate"}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000204',
    'INSERT', 'public.user_indicators'::regclass, 'public', 'user_indicators',
    '{"user_id":"20000000-0000-0000-0000-000000000201","indicator_id":"20000000-0000-0000-0000-000000000204","value":"1"}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000205',
    'INSERT', 'private.user_group_metric_category_links'::regclass,
    'private', 'user_group_metric_category_links',
    '{"metric_id":"20000000-0000-0000-0000-000000000205","category_id":"20000000-0000-0000-0000-000000000202"}'::jsonb
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
  ),
  'workspace user candidates retain indicator history after metric deletion'
);

select ok(
  exists (
    select 1 from private.user_group_activity_feed(
      '00000000-0000-0000-0000-000000000000',
      now() - interval '1 hour', now() + interval '1 hour', null::uuid
    ) where table_name = 'user_group_metric_category_links'
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

select * from finish();
rollback;
