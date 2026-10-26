begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index
    where indexrelid = 'public.idx_task_cycle_tasks_task_id_unique'::regclass
      and indisunique
      and indisvalid
  ),
  'task_cycle_tasks has a valid unique index on task_id'
);

select has_index(
  'public',
  'task_cycle_tasks',
  'idx_task_cycle_tasks_cycle_id',
  array['cycle_id'],
  'task_cycle_tasks has a cycle_id lookup index'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000f901', 'authenticated', 'authenticated', 'one-cycle-member@example.com', now(), now())
on conflict (id) do nothing;

insert into public.users (id, display_name)
values ('00000000-0000-4000-8000-00000000f901', 'One Cycle Member')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values ('00000000-0000-4000-8000-00000000f101', 'One Cycle Workspace', '00000000-0000-4000-8000-00000000f901', false)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-00000000f901', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.workspace_boards (id, ws_id, name, creator_id)
values ('00000000-0000-4000-8000-00000000f201', '00000000-0000-4000-8000-00000000f101', 'Board', '00000000-0000-4000-8000-00000000f901')
on conflict (id) do nothing;

insert into public.task_lists (id, name, board_id, creator_id)
values ('00000000-0000-4000-8000-00000000f301', 'List', '00000000-0000-4000-8000-00000000f201', '00000000-0000-4000-8000-00000000f901')
on conflict (id) do nothing;

insert into public.tasks (id, name, list_id, creator_id)
values ('00000000-0000-4000-8000-00000000f401', 'Task', '00000000-0000-4000-8000-00000000f301', '00000000-0000-4000-8000-00000000f901')
on conflict (id) do nothing;

insert into public.task_cycles (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-00000000f101', 'Cycle One', '00000000-0000-4000-8000-00000000f901'),
  ('00000000-0000-4000-8000-00000000f502', '00000000-0000-4000-8000-00000000f101', 'Cycle Two', '00000000-0000-4000-8000-00000000f901')
on conflict (id) do nothing;

-- Cycle writes go through the Tasks API, which uses the service role after
-- validating the workspace (authenticated has no task_cycles grant).
set local role service_role;

select lives_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f501')$$,
  'a task can be put into a cycle'
);

select throws_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f502')$$,
  '23505',
  null,
  'a task cannot be in two cycles at once'
);

select lives_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f502')
    on conflict (task_id) do update set cycle_id = excluded.cycle_id$$,
  'upserting on task_id moves the task to another cycle'
);

select results_eq(
  $$select cycle_id from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f401'$$,
  $$values ('00000000-0000-4000-8000-00000000f502'::uuid)$$,
  'the task now belongs only to the second cycle'
);

select lives_ok(
  $$delete from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f401'$$,
  'a task can return to the backlog'
);

select * from finish();

rollback;
