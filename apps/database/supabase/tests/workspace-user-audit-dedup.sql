begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions, audit;

select plan(3);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000000751')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000000752',
  'Audit Dedup Workspace',
  false,
  '00000000-0000-0000-0000-000000000751'
)
on conflict (id) do nothing;

insert into public.workspace_users (
  id,
  ws_id,
  full_name,
  email,
  archived,
  archived_until
)
values (
  '00000000-0000-0000-0000-000000000753',
  '00000000-0000-0000-0000-000000000752',
  'Audit Dedup User',
  'audit-dedup@example.com',
  false,
  null
)
on conflict (id) do nothing;

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
values (
  'UPDATE',
  '2026-04-18T08:00:00Z',
  'public.workspace_users'::regclass::oid,
  'public',
  'workspace_users',
  '00000000-0000-0000-0000-000000000753',
  '00000000-0000-0000-0000-000000000753',
  jsonb_build_object(
    'id', '00000000-0000-0000-0000-000000000753',
    'ws_id', '00000000-0000-0000-0000-000000000752',
    'archived', true,
    'archived_until', '2026-05-01T00:00:00Z',
    'full_name', 'Audit Dedup User'
  ),
  jsonb_build_object(
    'id', '00000000-0000-0000-0000-000000000753',
    'ws_id', '00000000-0000-0000-0000-000000000752',
    'archived', false,
    'archived_until', null,
    'full_name', 'Audit Dedup User'
  ),
  '00000000-0000-0000-0000-000000000751',
  'authenticated'
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
  '00000000-0000-0000-0000-000000000753',
  '00000000-0000-0000-0000-000000000752',
  true,
  '2026-05-01T00:00:00Z',
  null,
  '00000000-0000-0000-0000-000000000751',
  'live',
  '2026-04-18T08:00:01Z'
);

select ok(
  (
    select audit_record_version_id is not null
    from public.workspace_user_status_changes
    where ws_id = '00000000-0000-0000-0000-000000000752'
      and created_at = '2026-04-18T08:00:01Z'
  ),
  'live status rows link to the canonical workspace user audit record'
);

select is(
  (
    select count(*)
    from public.workspace_user_audit_feed(
      '00000000-0000-0000-0000-000000000752',
      '2026-04-18T00:00:00Z',
      '2026-04-19T00:00:00Z'
    )
  ),
  1::bigint,
  'one archive action appears once in the normalized audit feed'
);

select ok(
  not has_function_privilege(
    'anon',
    'audit.find_workspace_user_status_audit_record(uuid,uuid,boolean,timestamptz,uuid,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'audit.find_workspace_user_status_audit_record(uuid,uuid,boolean,timestamptz,uuid,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'audit.link_workspace_user_status_audit_record()',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'audit.link_workspace_user_status_audit_record()',
    'execute'
  ),
  'status-to-audit linking helpers are not callable by app roles'
);

select * from finish();
rollback;
