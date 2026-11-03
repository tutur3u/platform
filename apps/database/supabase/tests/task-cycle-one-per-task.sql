begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

-- One cycle per task is enforced by the assign_task_cycle() write path, not
-- by a table-wide index, so pre-existing duplicate links stay readable.
select has_index(
  'public',
  'task_cycle_tasks',
  'idx_task_cycle_tasks_cycle_id',
  array['cycle_id'],
  'task_cycle_tasks has a cycle_id lookup index'
);

select has_function(
  'public',
  'assign_task_cycle',
  array['uuid', 'uuid'],
  'assign_task_cycle(task, cycle) exists'
);

select isnt_definer(
  'public',
  'assign_task_cycle',
  array['uuid', 'uuid'],
  'assign_task_cycle runs as the caller (SECURITY INVOKER)'
);

-- CASE keeps the privilege probes from erroring before the function exists.
select ok(
  case
    when to_regprocedure('public.assign_task_cycle(uuid, uuid)') is null then false
    else not has_function_privilege('anon', 'public.assign_task_cycle(uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.assign_task_cycle(uuid, uuid)', 'execute')
  end,
  'anon and authenticated cannot execute assign_task_cycle'
);

select ok(
  case
    when to_regprocedure('public.assign_task_cycle(uuid, uuid)') is null then false
    else has_function_privilege('service_role', 'public.assign_task_cycle(uuid, uuid)', 'execute')
  end,
  'service_role (the Tasks API) can execute assign_task_cycle'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000f901', 'authenticated', 'authenticated', 'one-cycle-member@example.com', now(), now())
on conflict (id) do nothing;

insert into public.users (id, display_name)
values ('00000000-0000-4000-8000-00000000f901', 'One Cycle Member')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  ('00000000-0000-4000-8000-00000000f101', 'One Cycle Workspace', '00000000-0000-4000-8000-00000000f901', false),
  ('00000000-0000-4000-8000-00000000f102', 'Foreign One Cycle Workspace', '00000000-0000-4000-8000-00000000f901', false)
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
values
  ('00000000-0000-4000-8000-00000000f401', 'Task', '00000000-0000-4000-8000-00000000f301', '00000000-0000-4000-8000-00000000f901'),
  ('00000000-0000-4000-8000-00000000f402', 'Duplicate Task', '00000000-0000-4000-8000-00000000f301', '00000000-0000-4000-8000-00000000f901')
on conflict (id) do nothing;

insert into public.task_cycles (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000f503', '00000000-0000-4000-8000-00000000f102', 'Foreign Cycle', '00000000-0000-4000-8000-00000000f901'),
  ('00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-00000000f101', 'Cycle One', '00000000-0000-4000-8000-00000000f901'),
  ('00000000-0000-4000-8000-00000000f502', '00000000-0000-4000-8000-00000000f101', 'Cycle Two', '00000000-0000-4000-8000-00000000f901')
on conflict (id) do nothing;

-- Cycle writes go through the Tasks API, which uses the service role after
-- validating the workspace (authenticated has no task_cycles grant).
set local role service_role;

select lives_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f501')$$,
  'a task can be put into a cycle'
);

select results_eq(
  $$select cycle_id from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f401'$$,
  $$values ('00000000-0000-4000-8000-00000000f501'::uuid)$$,
  'the task is in the first cycle'
);

select lives_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f502')$$,
  'assigning the task to a second cycle succeeds'
);

select results_eq(
  $$select cycle_id from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f401'$$,
  $$values ('00000000-0000-4000-8000-00000000f502'::uuid)$$,
  'the move leaves exactly one link, to the second cycle'
);

select lives_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f502')$$,
  'assigning the task to its current cycle again succeeds'
);

select is(
  (select count(*)::int from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f401'),
  1,
  'a repeated assign keeps exactly one link'
);

select throws_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f503')$$,
  '42501',
  'Task and cycle must belong to the same workspace',
  'assigning a task to another workspace''s cycle is refused'
);

select results_eq(
  $$select cycle_id from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f401'$$,
  $$values ('00000000-0000-4000-8000-00000000f502'::uuid)$$,
  'a refused cross-workspace assign leaves the existing link in place'
);

select throws_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f4ff', '00000000-0000-4000-8000-00000000f501')$$,
  'P0002',
  'Task not found',
  'assigning a missing task is refused'
);

select throws_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f5ff')$$,
  'P0002',
  'Cycle not found',
  'assigning to a missing cycle is refused'
);

-- Synthetic pre-existing duplicates: this PR does not clean them up, so the
-- table must still accept and return them.
select lives_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id, created_at)
    values
      ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f501', '2026-01-01T00:00:00Z'),
      ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f502', '2026-02-01T00:00:00Z')$$,
  'pre-existing duplicate links for one task are tolerated'
);

-- The planning read picks the newest link, then the lowest cycle_id
-- (task_cycle_tasks has no id column; its key is (task_id, cycle_id)).
select results_eq(
  $$select cycle_id from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f402'
    order by created_at desc nulls last, cycle_id asc
    limit 1$$,
  $$values ('00000000-0000-4000-8000-00000000f502'::uuid)$$,
  'a read over duplicate links deterministically picks the newest link'
);

update public.task_cycle_tasks
set created_at = '2026-03-01T00:00:00Z'
where task_id = '00000000-0000-4000-8000-00000000f402';

select results_eq(
  $$select cycle_id from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f402'
    order by created_at desc nulls last, cycle_id asc
    limit 1$$,
  $$values ('00000000-0000-4000-8000-00000000f501'::uuid)$$,
  'equal created_at falls back to the lowest cycle_id'
);

select lives_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f501')$$,
  'assigning a task with duplicate links succeeds'
);

select results_eq(
  $$select cycle_id from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f402'$$,
  $$values ('00000000-0000-4000-8000-00000000f501'::uuid)$$,
  'the assign replaces every earlier link of that task with one link'
);

select lives_ok(
  $$delete from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f401'$$,
  'a task can return to the backlog'
);

select * from finish();

rollback;
