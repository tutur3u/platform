begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions, audit;

select plan(15);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000000702')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values
  (
    '00000000-0000-0000-0000-000000000710',
    'Audit Workspace',
    false,
    '00000000-0000-0000-0000-000000000701'
  ),
  (
    '00000000-0000-0000-0000-000000000711',
    'Other Audit Workspace',
    false,
    '00000000-0000-0000-0000-000000000701'
  )
on conflict (id) do nothing;

insert into public.workspace_users (
  id,
  ws_id,
  full_name,
  display_name,
  email,
  archived,
  archived_until
)
values
  (
    '00000000-0000-0000-0000-000000000720',
    '00000000-0000-0000-0000-000000000710',
    'Audit Target User',
    'Audit Target User',
    'audit-target@example.com',
    false,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000721',
    '00000000-0000-0000-0000-000000000710',
    'Linked Actor User',
    'Linked Actor User',
    'linked-actor@example.com',
    false,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000722',
    '00000000-0000-0000-0000-000000000711',
    'Other Workspace User',
    'Other Workspace User',
    'other-audit@example.com',
    false,
    null
  )
on conflict (id) do nothing;

insert into public.workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000721',
  '00000000-0000-0000-0000-000000000710'
)
on conflict do nothing;

insert into audit.record_version (
  op,
  ts,
  table_oid,
  table_schema,
  table_name,
  record_id,
  old_record_id,
  record,
  old_record,
  auth_uid,
  auth_role
)
values
  (
    'UPDATE',
    '2026-03-01T08:00:00Z',
    'public.workspace_users'::regclass::oid,
    'public',
    'workspace_users',
    '00000000-0000-0000-0000-000000000720',
    '00000000-0000-0000-0000-000000000720',
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000720',
      'ws_id', '00000000-0000-0000-0000-000000000710',
      'archived', true,
      'archived_until', null,
      'full_name', 'Audit Target User'
    ),
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000720',
      'ws_id', '00000000-0000-0000-0000-000000000710',
      'archived', false,
      'archived_until', null,
      'full_name', 'Audit Target User'
    ),
    '00000000-0000-0000-0000-000000000701',
    'authenticated'
  ),
  (
    'UPDATE',
    '2026-03-05T08:00:00Z',
    'public.workspace_users'::regclass::oid,
    'public',
    'workspace_users',
    '00000000-0000-0000-0000-000000000720',
    '00000000-0000-0000-0000-000000000720',
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000720',
      'ws_id', '00000000-0000-0000-0000-000000000710',
      'archived', false,
      'archived_until', null,
      'full_name', 'Audit Target User'
    ),
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000720',
      'ws_id', '00000000-0000-0000-0000-000000000710',
      'archived', true,
      'archived_until', '2026-03-10T00:00:00Z',
      'full_name', 'Audit Target User'
    ),
    '00000000-0000-0000-0000-000000000702',
    'authenticated'
  ),
  (
    'UPDATE',
    '2026-03-07T08:00:00Z',
    'public.workspace_users'::regclass::oid,
    'public',
    'workspace_users',
    '00000000-0000-0000-0000-000000000720',
    '00000000-0000-0000-0000-000000000720',
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000720',
      'ws_id', '00000000-0000-0000-0000-000000000710',
      'archived', true,
      'archived_until', '2026-03-12T00:00:00Z',
      'full_name', 'Audit Target User'
    ),
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000720',
      'ws_id', '00000000-0000-0000-0000-000000000710',
      'archived', true,
      'archived_until', '2026-03-10T00:00:00Z',
      'full_name', 'Audit Target User'
    ),
    '00000000-0000-0000-0000-000000000701',
    'authenticated'
  ),
  (
    'UPDATE',
    '2026-03-09T08:00:00Z',
    'public.workspace_users'::regclass::oid,
    'public',
    'workspace_users',
    '00000000-0000-0000-0000-000000000720',
    '00000000-0000-0000-0000-000000000720',
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000720',
      'ws_id', '00000000-0000-0000-0000-000000000710',
      'archived', true,
      'archived_until', '2026-03-12T00:00:00Z',
      'full_name', 'Audit Target User Renamed'
    ),
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000720',
      'ws_id', '00000000-0000-0000-0000-000000000710',
      'archived', true,
      'archived_until', '2026-03-12T00:00:00Z',
      'full_name', 'Audit Target User'
    ),
    '00000000-0000-0000-0000-000000000701',
    'authenticated'
  ),
  (
    'UPDATE',
    '2026-03-11T08:00:00Z',
    'public.workspace_users'::regclass::oid,
    'public',
    'workspace_users',
    '00000000-0000-0000-0000-000000000722',
    '00000000-0000-0000-0000-000000000722',
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000722',
      'ws_id', '00000000-0000-0000-0000-000000000711',
      'archived', true,
      'archived_until', null,
      'full_name', 'Other Workspace User'
    ),
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000722',
      'ws_id', '00000000-0000-0000-0000-000000000711',
      'archived', false,
      'archived_until', null,
      'full_name', 'Other Workspace User'
    ),
    '00000000-0000-0000-0000-000000000701',
    'authenticated'
  );

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_user_status_changes'
      and column_name = 'creator_id'
  ),
  'workspace_user_status_changes.creator_id is nullable for missing actor links'
);

select is(
  (
    select count(*)
    from public.list_workspace_user_audit_records(
      '00000000-0000-0000-0000-000000000710',
      '2026-03-01T00:00:00Z',
      '2026-04-01T00:00:00Z'
    )
  ),
  4::bigint,
  'list_workspace_user_audit_records scopes rows to the requested workspace'
);

select is(
  (
    select count(*)
    from public.backfill_workspace_user_status_changes(
      '00000000-0000-0000-0000-000000000710',
      true,
      20
    )
  ),
  3::bigint,
  'dry-run backfill returns archive-related rows and ignores unrelated profile updates'
);

select is(
  (
    select string_agg(event_kind, ',' order by audit_record_version_id)
    from public.backfill_workspace_user_status_changes(
      '00000000-0000-0000-0000-000000000710',
      true,
      20
    )
  ),
  'archived,reactivated,archive_until_changed',
  'dry-run classifies archive event kinds correctly'
);

select is(
  (
    select creator_id::text
    from public.backfill_workspace_user_status_changes(
      '00000000-0000-0000-0000-000000000710',
      true,
      20
    )
    where event_kind = 'reactivated'
  ),
  null,
  'dry-run keeps creator_id null when no workspace user link exists for the actor'
);

select is(
  (
    select count(*)
    from public.backfill_workspace_user_status_changes(
      '00000000-0000-0000-0000-000000000710',
      false,
      20
    )
  ),
  3::bigint,
  'backfill inserts the expected number of status rows'
);

select is(
  (
    select count(*)
    from public.workspace_user_status_changes
    where ws_id = '00000000-0000-0000-0000-000000000710'
      and source = 'backfilled'
  ),
  3::bigint,
  'backfilled status rows are persisted with the backfilled source marker'
);

select ok(
  exists (
    select 1
    from public.workspace_user_status_changes
    where audit_record_version_id is not null
      and actor_auth_uid = '00000000-0000-0000-0000-000000000701'
      and creator_id = '00000000-0000-0000-0000-000000000721'
  ),
  'backfilled rows preserve audit provenance and linked creator ids'
);

select is(
  (
    select count(*)
    from public.backfill_workspace_user_status_changes(
      '00000000-0000-0000-0000-000000000710',
      false,
      20
    )
  ),
  0::bigint,
  'backfill is idempotent when rerun'
);

select is(
  (
    select count(*)
    from public.workspace_user_status_changes
    where ws_id = '00000000-0000-0000-0000-000000000711'
  ),
  0::bigint,
  'backfill does not insert rows for other workspaces'
);

insert into public.workspace_user_status_changes (
  user_id,
  ws_id,
  archived,
  archived_until,
  creator_id,
  actor_auth_uid,
  source,
  created_at
)
values (
  '00000000-0000-0000-0000-000000000720',
  '00000000-0000-0000-0000-000000000710',
  true,
  '2026-03-20T00:00:00Z',
  '00000000-0000-0000-0000-000000000721',
  '00000000-0000-0000-0000-000000000701',
  'backfilled',
  '2026-03-15T08:00:00Z'
);

select is(
  (
    select count(*)
    from public.list_workspace_user_audit_feed(
      '00000000-0000-0000-0000-000000000710',
      '2026-03-01T00:00:00Z',
      '2026-04-01T00:00:00Z',
      'all',
      'all',
      null,
      null,
      20,
      0
    )
  ),
  5::bigint,
  'list_workspace_user_audit_feed includes unmatched legacy status rows'
);

select is(
  (
    select string_agg(
      total_events::text || ':' ||
      archived_events::text || ':' ||
      reactivated_events::text || ':' ||
      archive_timing_events::text || ':' ||
      profile_updates::text || ':' ||
      affected_users_count::text || ':' ||
      coalesce(top_actor_name, '') || ':' ||
      top_actor_count::text,
      ''
    )
    from public.summarize_workspace_user_audit_feed(
      '00000000-0000-0000-0000-000000000710',
      '2026-03-01T00:00:00Z',
      '2026-04-01T00:00:00Z',
      'all',
      'all',
      null,
      null
    )
  ),
  '5:2:1:1:1:1:Linked Actor User:4',
  'summarize_workspace_user_audit_feed returns exact counts and top actor from normalized feed'
);

select is(
  (
    select string_agg(
      bucket_key || ':' ||
      total_count::text || ':' ||
      archived_count::text || ':' ||
      reactivated_count::text || ':' ||
      archive_timing_count::text || ':' ||
      profile_update_count::text,
      ''
    )
    from public.list_workspace_user_audit_bucket_counts(
      '00000000-0000-0000-0000-000000000710',
      '2026-03-01T00:00:00Z',
      '2026-04-01T00:00:00Z',
      'monthly',
      'all',
      'all',
      null,
      null
    )
  ),
  '2026-03-01:1:1:0:0:02026-03-05:1:0:1:0:02026-03-07:1:0:0:1:02026-03-09:1:0:0:0:12026-03-15:1:1:0:0:0',
  'list_workspace_user_audit_bucket_counts returns per-bucket status counts without rounding'
);

select is(
  (
    select max(total_count)
    from public.list_workspace_user_audit_feed(
      '00000000-0000-0000-0000-000000000710',
      '2026-03-01T00:00:00Z',
      '2026-04-01T00:00:00Z',
      'all',
      'all',
      null,
      null,
      2,
      0
    )
  ),
  5::bigint,
  'paginated feed rows carry the exact total_count for the filtered result set'
);

select is(
  (
    select
      (payload->>'count') || ':' ||
      jsonb_array_length(payload->'rows')::text || ':' ||
      (payload->'summary'->>'total_events') || ':' ||
      (payload->'summary'->>'archived_events') || ':' ||
      (payload->'summary'->>'reactivated_events')
    from (
      select public.get_workspace_user_audit_view(
        '00000000-0000-0000-0000-000000000710',
        '2026-03-01T00:00:00Z',
        '2026-04-01T00:00:00Z',
        'monthly',
        'all',
        'all',
        null,
        null,
        2,
        0
      ) as payload
    ) view_payload
  ),
  '5:2:5:2:1',
  'get_workspace_user_audit_view returns exact counts and the requested page slice'
);

select * from finish();
rollback;
