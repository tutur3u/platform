begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_relationships'
      and policyname = 'Users can view task relationships in their workspaces'
      and cmd = 'SELECT'
  ),
  'member-readable relationship SELECT policy remains present'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_relationships'
      and policyname in (
        'Users can create task relationships in their workspaces',
        'Users can update task relationships in their workspaces',
        'Users can delete task relationships in their workspaces'
      )
  ),
  'membership-only relationship write policies are removed'
);

select policies_are(
  'public',
  'task_relationships',
  array[
    'Managers can create task relationships',
    'Managers can delete task relationships',
    'Managers can update task relationships',
    'Users can view task relationships in their workspaces'
  ],
  'task relationships expose one read and three permissioned write policies'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000f901', 'authenticated', 'authenticated', 'relationship-manager@example.com', now(), now()),
  ('00000000-0000-4000-8000-00000000f902', 'authenticated', 'authenticated', 'relationship-member@example.com', now(), now()),
  ('00000000-0000-4000-8000-00000000f903', 'authenticated', 'authenticated', 'relationship-owner@example.com', now(), now())
on conflict (id) do nothing;

insert into public.users (id, display_name)
values
  ('00000000-0000-4000-8000-00000000f901', 'Relationship Manager'),
  ('00000000-0000-4000-8000-00000000f902', 'Relationship Member'),
  ('00000000-0000-4000-8000-00000000f903', 'Relationship Owner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  ('00000000-0000-4000-8000-00000000f101', 'Relationship Workspace', '00000000-0000-4000-8000-00000000f903', false),
  ('00000000-0000-4000-8000-00000000f102', 'Foreign Relationship Workspace', '00000000-0000-4000-8000-00000000f903', false)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-00000000f901', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-00000000f902', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values
  ('00000000-0000-4000-8000-00000000f101', 'admin', 'MEMBER', false),
  ('00000000-0000-4000-8000-00000000f101', 'manage_projects', 'MEMBER', false)
on conflict (ws_id, permission, member_type)
do update set enabled = excluded.enabled;

insert into public.workspace_roles (id, ws_id, name)
values (
  '00000000-0000-4000-8000-00000000f111',
  '00000000-0000-4000-8000-00000000f101',
  'Relationship manager'
)
on conflict (id) do nothing;

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values (
  '00000000-0000-4000-8000-00000000f101',
  '00000000-0000-4000-8000-00000000f111',
  'manage_projects',
  true
)
on conflict (ws_id, permission, role_id)
do update set enabled = excluded.enabled;

insert into public.workspace_role_members (role_id, user_id)
values (
  '00000000-0000-4000-8000-00000000f111',
  '00000000-0000-4000-8000-00000000f901'
)
on conflict (role_id, user_id) do nothing;

insert into public.workspace_boards (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000f201', '00000000-0000-4000-8000-00000000f101', 'Source Board', '00000000-0000-4000-8000-00000000f903'),
  ('00000000-0000-4000-8000-00000000f202', '00000000-0000-4000-8000-00000000f101', 'Target Board', '00000000-0000-4000-8000-00000000f903'),
  ('00000000-0000-4000-8000-00000000f203', '00000000-0000-4000-8000-00000000f102', 'Foreign Board', '00000000-0000-4000-8000-00000000f903')
on conflict (id) do nothing;

insert into public.task_lists (id, name, board_id, creator_id)
values
  ('00000000-0000-4000-8000-00000000f301', 'Source List', '00000000-0000-4000-8000-00000000f201', '00000000-0000-4000-8000-00000000f903'),
  ('00000000-0000-4000-8000-00000000f302', 'Target List', '00000000-0000-4000-8000-00000000f202', '00000000-0000-4000-8000-00000000f903'),
  ('00000000-0000-4000-8000-00000000f303', 'Foreign List', '00000000-0000-4000-8000-00000000f203', '00000000-0000-4000-8000-00000000f903')
on conflict (id) do nothing;

insert into public.tasks (id, name, list_id, board_id, creator_id)
values
  ('00000000-0000-4000-8000-00000000f401', 'Source Task', '00000000-0000-4000-8000-00000000f301', '00000000-0000-4000-8000-00000000f201', '00000000-0000-4000-8000-00000000f903'),
  ('00000000-0000-4000-8000-00000000f402', 'Target Task', '00000000-0000-4000-8000-00000000f302', '00000000-0000-4000-8000-00000000f202', '00000000-0000-4000-8000-00000000f903'),
  ('00000000-0000-4000-8000-00000000f403', 'Alternate Target', '00000000-0000-4000-8000-00000000f302', '00000000-0000-4000-8000-00000000f202', '00000000-0000-4000-8000-00000000f903'),
  ('00000000-0000-4000-8000-00000000f404', 'Foreign Task', '00000000-0000-4000-8000-00000000f303', '00000000-0000-4000-8000-00000000f203', '00000000-0000-4000-8000-00000000f903')
on conflict (id) do nothing;

set local role service_role;
insert into public.task_relationships (source_task_id, target_task_id, type)
values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f402', 'blocks');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f902', true);

select is(
  (
    select count(*)::integer
    from public.task_relationships
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
  ),
  1,
  'ordinary workspace members retain relationship SELECT access'
);

select throws_ok(
  $$insert into public.task_relationships (source_task_id, target_task_id, type)
    values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f403', 'blocks')$$,
  '42501',
  'new row violates row-level security policy for table "task_relationships"',
  'ordinary members cannot directly insert relationships'
);

update public.task_relationships
set target_task_id = '00000000-0000-4000-8000-00000000f403'
where source_task_id = '00000000-0000-4000-8000-00000000f401'
  and target_task_id = '00000000-0000-4000-8000-00000000f402';
select is(
  (
    select target_task_id
    from public.task_relationships
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
  ),
  '00000000-0000-4000-8000-00000000f402'::uuid,
  'ordinary members cannot directly update relationships'
);

delete from public.task_relationships
where source_task_id = '00000000-0000-4000-8000-00000000f401';
select is(
  (
    select count(*)::integer
    from public.task_relationships
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
  ),
  1,
  'ordinary members cannot directly delete relationships'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f901', true);

set local role service_role;
delete from public.workspace_members
where ws_id = '00000000-0000-4000-8000-00000000f101'
  and user_id = '00000000-0000-4000-8000-00000000f901';
set local role authenticated;

select throws_ok(
  $$insert into public.task_relationships (source_task_id, target_task_id, type)
    values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f403', 'blocks')$$,
  '42501',
  'new row violates row-level security policy for table "task_relationships"',
  'stale role grants cannot authorize a non-member relationship write'
);

set local role service_role;
insert into public.workspace_members (ws_id, user_id, type)
values (
  '00000000-0000-4000-8000-00000000f101',
  '00000000-0000-4000-8000-00000000f901',
  'MEMBER'
)
on conflict (ws_id, user_id) do update set type = excluded.type;
set local role authenticated;

select lives_ok(
  $$insert into public.task_relationships (source_task_id, target_task_id, type)
    values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f403', 'blocks')$$,
  'project managers can create relationships across local boards'
);

select throws_ok(
  $$insert into public.task_relationships (source_task_id, target_task_id, type)
    values ('00000000-0000-4000-8000-00000000f404', '00000000-0000-4000-8000-00000000f402', 'blocks')$$,
  'P0001',
  'Task relationships can only be created between tasks in the same workspace.',
  'foreign source tasks fail containment'
);

select throws_ok(
  $$insert into public.task_relationships (source_task_id, target_task_id, type)
    values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f404', 'blocks')$$,
  'P0001',
  'Task relationships can only be created between tasks in the same workspace.',
  'foreign target tasks fail containment'
);

select lives_ok(
  $$update public.task_relationships
    set target_task_id = '00000000-0000-4000-8000-00000000f403'
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
      and target_task_id = '00000000-0000-4000-8000-00000000f402'$$,
  'project managers can move a relationship to another local parent'
);

select is(
  (
    select target_task_id
    from public.task_relationships
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
  ),
  '00000000-0000-4000-8000-00000000f403'::uuid,
  'authorized local parent movement persists'
);

select throws_ok(
  $$update public.task_relationships
    set target_task_id = '00000000-0000-4000-8000-00000000f404'
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
      and target_task_id = '00000000-0000-4000-8000-00000000f403'$$,
  'P0001',
  'Task relationships can only be created between tasks in the same workspace.',
  'project managers cannot move a relationship to a foreign parent'
);

select is(
  (
    select target_task_id
    from public.task_relationships
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
  ),
  '00000000-0000-4000-8000-00000000f403'::uuid,
  'failed foreign movement preserves the local parent'
);

select lives_ok(
  $$delete from public.task_relationships
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
      and target_task_id = '00000000-0000-4000-8000-00000000f403'$$,
  'project managers can delete local relationships'
);

select is(
  (
    select count(*)::integer
    from public.task_relationships
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
  ),
  0,
  'authorized relationship deletion persists'
);

set local role service_role;

select lives_ok(
  $$insert into public.task_relationships (source_task_id, target_task_id, type)
    values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f402', 'blocks')$$,
  'service-role route writes continue to bypass RLS after route authorization'
);

select lives_ok(
  $$delete from public.task_relationships
    where source_task_id = '00000000-0000-4000-8000-00000000f401'
      and target_task_id = '00000000-0000-4000-8000-00000000f402'$$,
  'service-role route cleanup remains available'
);

reset role;

select * from finish();
rollback;
