begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'task_project_tasks'
      and policyname = 'Users can view task project tasks in their workspaces'
      and cmd = 'SELECT'
  ),
  'member-readable task-project SELECT policy remains present'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'task_project_tasks'
      and policyname = 'Users can manage task project tasks in their workspaces'
  ),
  'membership-only task-project write policy is removed'
);

select policies_are(
  'public',
  'task_project_tasks',
  array[
    'Managers can delete task project links',
    'Managers can insert task project links',
    'Managers can update task project links',
    'Users can view task project tasks in their workspaces'
  ],
  'task-project links expose one read and three permissioned write policies'
);

select ok(
  not exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'link_task_project_with_actor',
        'unlink_task_project_with_actor'
      )
      and prosecdef
  ),
  'task-project actor RPCs remain SECURITY INVOKER'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000e901', 'authenticated', 'authenticated', 'project-manager@example.com', now(), now()),
  ('00000000-0000-4000-8000-00000000e902', 'authenticated', 'authenticated', 'project-member@example.com', now(), now()),
  ('00000000-0000-4000-8000-00000000e903', 'authenticated', 'authenticated', 'project-owner@example.com', now(), now())
on conflict (id) do nothing;

insert into public.users (id, display_name)
values
  ('00000000-0000-4000-8000-00000000e901', 'Project Manager'),
  ('00000000-0000-4000-8000-00000000e902', 'Project Member'),
  ('00000000-0000-4000-8000-00000000e903', 'Project Owner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  ('00000000-0000-4000-8000-00000000e101', 'Project Link Workspace', '00000000-0000-4000-8000-00000000e903', false),
  ('00000000-0000-4000-8000-00000000e102', 'Foreign Project Link Workspace', '00000000-0000-4000-8000-00000000e903', false)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-00000000e901', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-00000000e902', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values
  ('00000000-0000-4000-8000-00000000e101', 'admin', 'MEMBER', false),
  ('00000000-0000-4000-8000-00000000e101', 'manage_projects', 'MEMBER', false)
on conflict (ws_id, permission, member_type)
do update set enabled = excluded.enabled;

insert into public.workspace_roles (id, ws_id, name)
values (
  '00000000-0000-4000-8000-00000000e111',
  '00000000-0000-4000-8000-00000000e101',
  'Project manager'
)
on conflict (id) do nothing;

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values (
  '00000000-0000-4000-8000-00000000e101',
  '00000000-0000-4000-8000-00000000e111',
  'manage_projects',
  true
)
on conflict (ws_id, permission, role_id)
do update set enabled = excluded.enabled;

insert into public.workspace_role_members (role_id, user_id)
values (
  '00000000-0000-4000-8000-00000000e111',
  '00000000-0000-4000-8000-00000000e901'
)
on conflict (role_id, user_id) do nothing;

insert into public.workspace_boards (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000e201', '00000000-0000-4000-8000-00000000e101', 'Local Board', '00000000-0000-4000-8000-00000000e903'),
  ('00000000-0000-4000-8000-00000000e202', '00000000-0000-4000-8000-00000000e102', 'Foreign Board', '00000000-0000-4000-8000-00000000e903')
on conflict (id) do nothing;

insert into public.task_lists (id, name, board_id, creator_id)
values
  ('00000000-0000-4000-8000-00000000e301', 'Local List', '00000000-0000-4000-8000-00000000e201', '00000000-0000-4000-8000-00000000e903'),
  ('00000000-0000-4000-8000-00000000e302', 'Foreign List', '00000000-0000-4000-8000-00000000e202', '00000000-0000-4000-8000-00000000e903')
on conflict (id) do nothing;

insert into public.tasks (id, name, list_id, creator_id)
values
  ('00000000-0000-4000-8000-00000000e401', 'Local Task One', '00000000-0000-4000-8000-00000000e301', '00000000-0000-4000-8000-00000000e903'),
  ('00000000-0000-4000-8000-00000000e402', 'Local Task Two', '00000000-0000-4000-8000-00000000e301', '00000000-0000-4000-8000-00000000e903'),
  ('00000000-0000-4000-8000-00000000e403', 'Foreign Task', '00000000-0000-4000-8000-00000000e302', '00000000-0000-4000-8000-00000000e903')
on conflict (id) do nothing;

insert into public.task_projects (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000e501', '00000000-0000-4000-8000-00000000e101', 'Local Project One', '00000000-0000-4000-8000-00000000e903'),
  ('00000000-0000-4000-8000-00000000e502', '00000000-0000-4000-8000-00000000e101', 'Local Project Two', '00000000-0000-4000-8000-00000000e903'),
  ('00000000-0000-4000-8000-00000000e503', '00000000-0000-4000-8000-00000000e102', 'Foreign Project', '00000000-0000-4000-8000-00000000e903')
on conflict (id) do nothing;

set local role service_role;
insert into public.task_project_tasks (task_id, project_id)
values ('00000000-0000-4000-8000-00000000e401', '00000000-0000-4000-8000-00000000e501');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e902', true);

select is(
  (select count(*)::integer from public.task_project_tasks where task_id = '00000000-0000-4000-8000-00000000e401'),
  1,
  'ordinary workspace members retain SELECT access'
);

select throws_ok(
  $$insert into public.task_project_tasks (task_id, project_id)
    values ('00000000-0000-4000-8000-00000000e402', '00000000-0000-4000-8000-00000000e501')$$,
  '42501',
  'new row violates row-level security policy for table "task_project_tasks"',
  'ordinary members cannot directly insert task-project links'
);

update public.task_project_tasks
set project_id = '00000000-0000-4000-8000-00000000e502'
where task_id = '00000000-0000-4000-8000-00000000e401';
select is(
  (select project_id from public.task_project_tasks where task_id = '00000000-0000-4000-8000-00000000e401'),
  '00000000-0000-4000-8000-00000000e501'::uuid,
  'ordinary members cannot directly update task-project links'
);

delete from public.task_project_tasks
where task_id = '00000000-0000-4000-8000-00000000e401';
select is(
  (select count(*)::integer from public.task_project_tasks where task_id = '00000000-0000-4000-8000-00000000e401'),
  1,
  'ordinary members cannot directly delete task-project links'
);

select throws_ok(
  $$select * from public.link_task_project_with_actor(
    '00000000-0000-4000-8000-00000000e402',
    '00000000-0000-4000-8000-00000000e501',
    '00000000-0000-4000-8000-00000000e902'
  )$$,
  '42501',
  'new row violates row-level security policy for table "task_project_tasks"',
  'ordinary members cannot link through the invoker RPC'
);

select is(
  (select count(*)::integer from public.unlink_task_project_with_actor(
    '00000000-0000-4000-8000-00000000e401',
    '00000000-0000-4000-8000-00000000e501',
    '00000000-0000-4000-8000-00000000e902'
  )),
  0,
  'ordinary members cannot unlink through the invoker RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e901', true);

select lives_ok(
  $$insert into public.task_project_tasks (task_id, project_id)
    values ('00000000-0000-4000-8000-00000000e402', '00000000-0000-4000-8000-00000000e501')$$,
  'project managers can directly insert local task-project links'
);

select lives_ok(
  $$delete from public.task_project_tasks
    where task_id = '00000000-0000-4000-8000-00000000e402'
      and project_id = '00000000-0000-4000-8000-00000000e501'$$,
  'project managers can directly delete local task-project links'
);

select lives_ok(
  $$select * from public.link_task_project_with_actor(
    '00000000-0000-4000-8000-00000000e402',
    '00000000-0000-4000-8000-00000000e501',
    '00000000-0000-4000-8000-00000000e901'
  )$$,
  'project managers can link through the invoker RPC'
);

select is(
  (select count(*)::integer from public.unlink_task_project_with_actor(
    '00000000-0000-4000-8000-00000000e402',
    '00000000-0000-4000-8000-00000000e501',
    '00000000-0000-4000-8000-00000000e901'
  )),
  1,
  'project managers can unlink through the invoker RPC'
);

select throws_ok(
  $$insert into public.task_project_tasks (task_id, project_id)
    values ('00000000-0000-4000-8000-00000000e401', '00000000-0000-4000-8000-00000000e503')$$,
  '42501',
  'new row violates row-level security policy for table "task_project_tasks"',
  'a local task cannot be linked to a foreign project'
);

select throws_ok(
  $$insert into public.task_project_tasks (task_id, project_id)
    values ('00000000-0000-4000-8000-00000000e403', '00000000-0000-4000-8000-00000000e501')$$,
  '42501',
  'new row violates row-level security policy for table "task_project_tasks"',
  'a foreign task cannot be linked to a local project'
);

select throws_ok(
  $$update public.task_project_tasks
    set task_id = '00000000-0000-4000-8000-00000000e403'
    where task_id = '00000000-0000-4000-8000-00000000e401'
      and project_id = '00000000-0000-4000-8000-00000000e501'$$,
  '42501',
  'new row violates row-level security policy for table "task_project_tasks"',
  'project managers cannot move an existing link to a foreign task'
);

set local role service_role;

select lives_ok(
  $$insert into public.task_project_tasks (task_id, project_id)
    values ('00000000-0000-4000-8000-00000000e402', '00000000-0000-4000-8000-00000000e502')$$,
  'service-role route writes continue to bypass RLS after explicit route authorization'
);

select lives_ok(
  $$delete from public.task_project_tasks
    where task_id = '00000000-0000-4000-8000-00000000e402'
      and project_id = '00000000-0000-4000-8000-00000000e502'$$,
  'service-role route cleanup remains available'
);

reset role;

select * from finish();
rollback;
