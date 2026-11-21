begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

-- One cycle per task covers workspace cycles only (task_cycles.board_id IS
-- NULL). Board sprints (board_id set, 20261101100000-030) keep one
-- task_cycle_tasks row per sprint as history and are managed by the sprint
-- functions and trigger, so assign_task_cycle() must never touch them.

-- Main's 20261101100000 already indexes cycle_id; this PR adds no second one.
select has_index(
  'public',
  'task_cycle_tasks',
  'task_cycle_tasks_cycle_id_idx',
  array['cycle_id'],
  'task_cycle_tasks keeps main''s cycle_id lookup index'
);

select ok(
  to_regclass('public.idx_task_cycle_tasks_cycle_id') is null,
  'no duplicate cycle_id index is added'
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

insert into public.task_cycles (id, ws_id, name, creator_id, deleted)
values
  ('00000000-0000-4000-8000-00000000f503', '00000000-0000-4000-8000-00000000f102', 'Foreign Cycle', '00000000-0000-4000-8000-00000000f901', false),
  ('00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-00000000f101', 'Cycle One', '00000000-0000-4000-8000-00000000f901', false),
  ('00000000-0000-4000-8000-00000000f502', '00000000-0000-4000-8000-00000000f101', 'Cycle Two', '00000000-0000-4000-8000-00000000f901', false),
  ('00000000-0000-4000-8000-00000000f504', '00000000-0000-4000-8000-00000000f101', 'Deleted Cycle', '00000000-0000-4000-8000-00000000f901', true)
on conflict (id) do nothing;

-- Board sprints through main's own functions: turning sprints on puts both
-- open tasks into Sprint 1; starting it plans Sprint 2; ending it carries
-- both tasks, so each keeps a completed Sprint 1 history row
-- (end_decision 'carry') and an open Sprint 2 row (carry_count 1).
select ok(
  (public.set_board_sprint_length('00000000-0000-4000-8000-00000000f201', 2::smallint)).sequence_number = 1,
  'fixture: sprints on, Sprint 1 planned'
);
do $$
declare
  v_sprint_one uuid := (
    select id from public.task_cycles
    where board_id = '00000000-0000-4000-8000-00000000f201' and sequence_number = 1);
begin
  perform public.start_board_sprint(v_sprint_one);
  perform public.end_board_sprint(v_sprint_one);
end;
$$;

create temp table sprint_rows_before on commit drop as
select tct.task_id, tct.cycle_id, tct.created_at, tct.added_after_start,
  tct.carry_count, tct.end_decision
from public.task_cycle_tasks tct
join public.task_cycles c on c.id = tct.cycle_id
where c.board_id is not null;
grant select on sprint_rows_before to service_role;

select results_eq(
  $$select c.sequence_number, c.status, tct.carry_count, tct.end_decision
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f401'
    order by c.sequence_number$$,
  $$values (1, 'completed'::text, 0, 'carry'::text), (2, 'planned'::text, 1, null::text)$$,
  'fixture: the task has a completed sprint history row and an open sprint row'
);

-- Cycle writes go through the Tasks API, which uses the service role after
-- its membership, manage_projects and workspace checks. (authenticated does
-- hold table grants on task_cycles and task_cycle_tasks from 20250929060000,
-- limited by RLS; it has no EXECUTE on assign_task_cycle.)
set local role service_role;

select lives_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f501')$$,
  'a task can be put into a workspace cycle'
);

select results_eq(
  $$select tct.cycle_id from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f401' and c.board_id is null$$,
  $$values ('00000000-0000-4000-8000-00000000f501'::uuid)$$,
  'the task is in the first workspace cycle'
);

select lives_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f502')$$,
  'assigning the task to a second workspace cycle succeeds'
);

select results_eq(
  $$select tct.cycle_id from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f401' and c.board_id is null$$,
  $$values ('00000000-0000-4000-8000-00000000f502'::uuid)$$,
  'the move leaves exactly one workspace-cycle link, to the second cycle'
);

select set_eq(
  $$select tct.task_id, tct.cycle_id, tct.created_at, tct.added_after_start,
      tct.carry_count, tct.end_decision
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where c.board_id is not null$$,
  $$select * from sprint_rows_before$$,
  'assigns never delete or change board-sprint rows (history and open sprint)'
);

select lives_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f502')$$,
  'assigning the task to its current cycle again succeeds'
);

select is(
  (select count(*)::int from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f401' and c.board_id is null),
  1,
  'a repeated assign keeps exactly one workspace-cycle link'
);

select throws_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401',
    (select id from public.task_cycles where board_id = '00000000-0000-4000-8000-00000000f201' and sequence_number = 1))$$,
  '22023',
  'Board sprints are managed by the board sprint functions',
  'assigning a task to a completed board sprint is refused'
);

select throws_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401',
    (select id from public.task_cycles where board_id = '00000000-0000-4000-8000-00000000f201' and sequence_number = 2))$$,
  '22023',
  'Board sprints are managed by the board sprint functions',
  'assigning a task to an open board sprint is refused'
);

select throws_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f504')$$,
  'P0002',
  'Cycle not found',
  'assigning a task to a deleted cycle is refused'
);

select throws_ok(
  $$select public.assign_task_cycle(
    '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f503')$$,
  '42501',
  'Task and cycle must belong to the same workspace',
  'assigning a task to another workspace''s cycle is refused'
);

select results_eq(
  $$select tct.cycle_id from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f401' and c.board_id is null$$,
  $$values ('00000000-0000-4000-8000-00000000f502'::uuid)$$,
  'refused assigns leave the existing workspace-cycle link in place'
);

select set_eq(
  $$select tct.task_id, tct.cycle_id, tct.created_at, tct.added_after_start,
      tct.carry_count, tct.end_decision
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where c.board_id is not null$$,
  $$select * from sprint_rows_before$$,
  'refused assigns leave board-sprint rows unchanged'
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
-- table must still accept and return them. One links the deleted cycle.
select lives_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id, created_at)
    values
      ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f501', '2026-01-01T00:00:00Z'),
      ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f502', '2026-02-01T00:00:00Z'),
      ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f504', '2026-04-01T00:00:00Z')$$,
  'pre-existing duplicate links for one task are tolerated'
);

-- The planning read (current cycle) picks, among links to workspace cycles
-- that are not deleted, the newest link, then the lowest cycle_id
-- (task_cycle_tasks has no id column; its key is (task_id, cycle_id)).
-- Board-sprint rows and the deleted cycle's link are ignored.
select results_eq(
  $$select tct.cycle_id from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f402'
      and c.board_id is null and c.deleted is not true
    order by tct.created_at desc nulls last, tct.cycle_id asc
    limit 1$$,
  $$values ('00000000-0000-4000-8000-00000000f502'::uuid)$$,
  'a read over duplicate links picks the newest live workspace-cycle link'
);

update public.task_cycle_tasks tct
set created_at = '2026-03-01T00:00:00Z'
from public.task_cycles c
where c.id = tct.cycle_id
  and c.board_id is null
  and c.deleted is not true
  and tct.task_id = '00000000-0000-4000-8000-00000000f402';

select results_eq(
  $$select tct.cycle_id from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f402'
      and c.board_id is null and c.deleted is not true
    order by tct.created_at desc nulls last, tct.cycle_id asc
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
  $$select tct.cycle_id from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f402' and c.board_id is null$$,
  $$values ('00000000-0000-4000-8000-00000000f501'::uuid)$$,
  'the assign replaces every earlier workspace-cycle link (deleted one too) with one link'
);

select set_eq(
  $$select tct.task_id, tct.cycle_id, tct.created_at, tct.added_after_start,
      tct.carry_count, tct.end_decision
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where c.board_id is not null$$,
  $$select * from sprint_rows_before$$,
  'collapsing duplicates keeps both tasks'' board-sprint rows'
);

select is(
  (select count(*)::int from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f402'),
  3,
  'the task ends with one workspace-cycle link plus its two sprint rows'
);

-- The sprint functions keep working on tasks that are in a workspace cycle.
reset role;
select lives_ok(
  $$select public.move_tasks_to_board_sprint(
    '00000000-0000-4000-8000-00000000f201',
    array['00000000-0000-4000-8000-00000000f401'::uuid],
    null)$$,
  'a sprint move still works on a task in a workspace cycle'
);

select results_eq(
  $$select c.board_id is null, c.status
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-00000000f401'
    order by c.board_id is null, c.sequence_number$$,
  $$values (false, 'completed'::text), (true, 'planned'::text)$$,
  'the sprint move removes only the open sprint row; history and the workspace cycle stay'
);

set local role service_role;
select lives_ok(
  $$delete from public.task_cycle_tasks
    where task_id = '00000000-0000-4000-8000-00000000f401'
      and cycle_id = '00000000-0000-4000-8000-00000000f502'$$,
  'a task can return to the backlog'
);

select * from finish();

rollback;
