begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

select has_trigger(
  'public',
  'task_cycle_tasks',
  'enforce_task_cycle_task_workspace',
  'task_cycle_tasks has the same-workspace guard trigger'
);

select has_trigger(
  'public',
  'task_cycles',
  'prevent_task_cycle_workspace_change',
  'task_cycles has the workspace immutability trigger'
);

select ok(
  (
    select bool_and(
      p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog, pg_temp']
    )
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'enforce_task_cycle_task_workspace',
        'prevent_task_cycle_workspace_change'
      )
  ),
  'guard functions are SECURITY DEFINER with a pinned search_path'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.enforce_task_cycle_task_workspace()',
    'execute'
  ),
  'authenticated cannot execute the guard function directly'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000c901', 'authenticated', 'authenticated', 'cycle-member@example.com', now(), now()),
  ('00000000-0000-4000-8000-00000000c903', 'authenticated', 'authenticated', 'cycle-owner@example.com', now(), now())
on conflict (id) do nothing;

insert into public.users (id, display_name)
values
  ('00000000-0000-4000-8000-00000000c901', 'Cycle Member'),
  ('00000000-0000-4000-8000-00000000c903', 'Cycle Owner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  ('00000000-0000-4000-8000-00000000c101', 'Cycle Workspace', '00000000-0000-4000-8000-00000000c903', false),
  ('00000000-0000-4000-8000-00000000c102', 'Foreign Cycle Workspace', '00000000-0000-4000-8000-00000000c903', false)
on conflict (id) do nothing;

-- The member belongs to both workspaces, so RLS alone cannot stop the link.
insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c901', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000c102', '00000000-0000-4000-8000-00000000c901', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.workspace_boards (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000c201', '00000000-0000-4000-8000-00000000c101', 'Local Board', '00000000-0000-4000-8000-00000000c903'),
  ('00000000-0000-4000-8000-00000000c202', '00000000-0000-4000-8000-00000000c102', 'Foreign Board', '00000000-0000-4000-8000-00000000c903')
on conflict (id) do nothing;

insert into public.task_lists (id, name, board_id, creator_id)
values
  ('00000000-0000-4000-8000-00000000c301', 'Local List', '00000000-0000-4000-8000-00000000c201', '00000000-0000-4000-8000-00000000c903'),
  ('00000000-0000-4000-8000-00000000c302', 'Foreign List', '00000000-0000-4000-8000-00000000c202', '00000000-0000-4000-8000-00000000c903')
on conflict (id) do nothing;

insert into public.tasks (id, name, list_id, creator_id)
values
  ('00000000-0000-4000-8000-00000000c401', 'Local Task One', '00000000-0000-4000-8000-00000000c301', '00000000-0000-4000-8000-00000000c903'),
  ('00000000-0000-4000-8000-00000000c402', 'Local Task Two', '00000000-0000-4000-8000-00000000c301', '00000000-0000-4000-8000-00000000c903'),
  ('00000000-0000-4000-8000-00000000c403', 'Foreign Task', '00000000-0000-4000-8000-00000000c302', '00000000-0000-4000-8000-00000000c903')
on conflict (id) do nothing;

-- A task whose workspace cannot be resolved (no list).
insert into public.tasks (id, name, list_id, creator_id)
values ('00000000-0000-4000-8000-00000000c404', 'Listless Task', null, '00000000-0000-4000-8000-00000000c903')
on conflict (id) do nothing;

insert into public.task_cycles (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000c501', '00000000-0000-4000-8000-00000000c101', 'Local Cycle', '00000000-0000-4000-8000-00000000c903'),
  ('00000000-0000-4000-8000-00000000c502', '00000000-0000-4000-8000-00000000c102', 'Foreign Cycle', '00000000-0000-4000-8000-00000000c903')
on conflict (id) do nothing;

-- Authenticated member path: the Data API role has no table grant on
-- task_cycles/tasks, so a direct link attempt is denied before the trigger.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000c901', true);

select throws_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000c403', '00000000-0000-4000-8000-00000000c501')$$,
  '42501',
  null,
  'authenticated member cannot link a foreign task into their cycle'
);

select throws_ok(
  $$update public.task_cycles
    set ws_id = '00000000-0000-4000-8000-00000000c102'
    where id = '00000000-0000-4000-8000-00000000c501'$$,
  '42501',
  null,
  'authenticated member cannot move a cycle to another workspace'
);

-- API route path: service-role writes bypass RLS and grants, not the trigger.
reset role;
set local role service_role;

select lives_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c501')$$,
  'service-role write can link a same-workspace task'
);

select throws_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000c403', '00000000-0000-4000-8000-00000000c501')$$,
  '42501',
  'Task and cycle must belong to the same workspace',
  'service-role write cannot link a cross-workspace task'
);

select throws_ok(
  $$update public.task_cycle_tasks
    set task_id = '00000000-0000-4000-8000-00000000c403'
    where task_id = '00000000-0000-4000-8000-00000000c401'$$,
  '42501',
  'Task and cycle must belong to the same workspace',
  'service-role write cannot repoint a link at a foreign task'
);

select throws_ok(
  $$update public.task_cycle_tasks
    set cycle_id = '00000000-0000-4000-8000-00000000c502'
    where task_id = '00000000-0000-4000-8000-00000000c401'$$,
  '42501',
  'Task and cycle must belong to the same workspace',
  'service-role write cannot repoint a link at another workspace''s cycle'
);

select throws_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c501')
    on conflict (task_id, cycle_id)
    do update set cycle_id = '00000000-0000-4000-8000-00000000c502'$$,
  '42501',
  'Task and cycle must belong to the same workspace',
  'an upsert cannot move a link into another workspace''s cycle'
);

select throws_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000c404', '00000000-0000-4000-8000-00000000c501')$$,
  '42501',
  'Task and cycle must belong to the same workspace',
  'a task with no resolvable workspace cannot join a cycle'
);

select throws_ok(
  $$update public.task_cycles
    set ws_id = '00000000-0000-4000-8000-00000000c102'
    where id = '00000000-0000-4000-8000-00000000c501'$$,
  '42501',
  'A task cycle cannot move to another workspace',
  'service-role write cannot move a cycle to another workspace'
);

select lives_ok(
  $$update public.task_cycles
    set name = 'Renamed Cycle'
    where id = '00000000-0000-4000-8000-00000000c501'$$,
  'cycle fields other than ws_id stay editable'
);

select lives_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000c402', '00000000-0000-4000-8000-00000000c501')$$,
  'a second same-workspace task can join the cycle'
);

select is(
  (
    select count(*)::integer
    from public.task_cycle_tasks
    where cycle_id = '00000000-0000-4000-8000-00000000c501'
  ),
  2,
  'only the two same-workspace links exist'
);

select is(
  (
    select ws_id
    from public.task_cycles
    where id = '00000000-0000-4000-8000-00000000c501'
  ),
  '00000000-0000-4000-8000-00000000c101'::uuid,
  'the cycle stays in its original workspace'
);

select * from finish();

rollback;
