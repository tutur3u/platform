begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
set local role service_role;
select plan(34);

insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-0000000e5001', 'Sprint Owner'),
  ('00000000-0000-4000-8000-0000000e5002', 'Sprint Helper')
on conflict (id) do nothing;
insert into public.workspaces (id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-0000000e5010', 'Sprint Workspace', '00000000-0000-4000-8000-0000000e5001', false)
on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-4000-8000-0000000e5010', '00000000-0000-4000-8000-0000000e5001', 'MEMBER'),
  ('00000000-0000-4000-8000-0000000e5010', '00000000-0000-4000-8000-0000000e5002', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
insert into public.workspace_boards (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e5020', '00000000-0000-4000-8000-0000000e5010', 'Sprint Board', '00000000-0000-4000-8000-0000000e5001'),
  ('00000000-0000-4000-8000-0000000e5021', '00000000-0000-4000-8000-0000000e5010', 'Other Board', '00000000-0000-4000-8000-0000000e5001')
on conflict (id) do nothing;

insert into public.tasks (id, name, list_id, estimation_points, creator_id) values
  ('00000000-0000-4000-8000-0000000e5101', 'Owned open task', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5020' and status = 'active' limit 1), 3, '00000000-0000-4000-8000-0000000e5001'),
  ('00000000-0000-4000-8000-0000000e5102', 'Unassigned open task', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5020' and status = 'active' limit 1), 2, '00000000-0000-4000-8000-0000000e5001'),
  ('00000000-0000-4000-8000-0000000e5103', 'Already done', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5020' and status = 'done' limit 1), 5, '00000000-0000-4000-8000-0000000e5001'),
  ('00000000-0000-4000-8000-0000000e5109', 'Other board task', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5021' and status = 'active' limit 1), null, '00000000-0000-4000-8000-0000000e5001');
insert into public.task_assignees (task_id, user_id) values
  ('00000000-0000-4000-8000-0000000e5101', '00000000-0000-4000-8000-0000000e5001');

select has_column('public', 'workspace_boards', 'sprint_length_weeks', 'boards store a sprint length');
select has_column('public', 'task_cycles', 'board_id', 'cycles can belong to a board');
select has_table('public', 'task_sprint_reports', 'sprint reports table exists');

select is(
  (select count(*)::int from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020'),
  0,
  'a board starts without sprints'
);

-- Turning sprints on.
select lives_ok(
  $$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e5020', 2::smallint, '00000000-0000-4000-8000-0000000e5001')$$,
  'turning sprints on succeeds'
);
select is(
  (select name || ':' || status from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020'),
  'Sprint 1:planned',
  'turning sprints on creates Sprint 1 in planning'
);
select is(
  (select extract(isodow from start_date)::int from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020'),
  1,
  'sprints start on a Monday'
);
select is(
  (select end_date - start_date from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020'),
  11,
  'a two-week sprint ends on its second Friday'
);
select is(
  (
    select array_agg(tct.task_id order by tct.task_id)
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where c.board_id = '00000000-0000-4000-8000-0000000e5020'
  ),
  array['00000000-0000-4000-8000-0000000e5101', '00000000-0000-4000-8000-0000000e5102']::uuid[],
  'open tasks join the sprint being planned and done tasks stay out'
);

insert into public.tasks (id, name, list_id) values
  ('00000000-0000-4000-8000-0000000e5104', 'Planned later', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5020' and status = 'active' limit 1));
select is(
  (
    select tct.added_after_start
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-0000000e5104' and c.status = 'planned'
  ),
  false,
  'a task created while planning joins the planned sprint as committed'
);

-- Starting.
select is(
  (public.start_board_sprint((select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 1), '00000000-0000-4000-8000-0000000e5001')).status,
  'active',
  'starting the planned sprint makes it active'
);
select is(
  (select name || ':' || status from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 2),
  'Sprint 2:planned',
  'starting a sprint opens the next one for planning'
);
select is(
  (select start_date from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 2)
    - (select end_date from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 1),
  3,
  'the next sprint starts the Monday after the Friday the current one ends'
);
select is(
  (public.start_board_sprint((select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 1))).status,
  'active',
  'starting an active sprint again is a no-op'
);
select throws_ok(
  $$select public.start_board_sprint((select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 2))$$,
  '55000',
  'SPRINT_ALREADY_ACTIVE',
  'a board runs one sprint at a time'
);

insert into public.tasks (id, name, list_id) values
  ('00000000-0000-4000-8000-0000000e5105', 'Added mid-sprint', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5020' and status = 'active' limit 1));
select is(
  (
    select c.sequence_number || ':' || tct.added_after_start
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-0000000e5105'
  ),
  '1:true',
  'a task created mid-sprint joins the active sprint flagged as added'
);

-- Moving between open sprints.
select is(
  public.move_tasks_to_board_sprint(
    '00000000-0000-4000-8000-0000000e5020',
    array['00000000-0000-4000-8000-0000000e5102']::uuid[],
    (select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 2)
  ),
  1,
  'moving a task to the next sprint reports one move'
);
select is(
  (
    select array_agg(c.sequence_number)
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-0000000e5102'
  ),
  array[2],
  'a task sits in one open sprint at a time'
);
select throws_ok(
  $$select public.move_tasks_to_board_sprint(
    '00000000-0000-4000-8000-0000000e5020',
    array['00000000-0000-4000-8000-0000000e5109']::uuid[],
    (select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 2)
  )$$,
  '22023',
  'SPRINT_TASK_NOT_ON_BOARD',
  'tasks from another board cannot join the sprint'
);

-- Ending.
insert into public.task_assignees (task_id, user_id) values
  ('00000000-0000-4000-8000-0000000e5105', '00000000-0000-4000-8000-0000000e5002');
update public.tasks
set list_id = (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5020' and status = 'done' limit 1)
where id = '00000000-0000-4000-8000-0000000e5104';

select is(
  (
    select r.total_tasks || '/' || r.done_tasks || '/' || r.added_tasks || '/' || r.carried_tasks || '/' || r.backlog_tasks || '/' || r.goal_result
    from public.end_board_sprint(
      (select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 1),
      '00000000-0000-4000-8000-0000000e5001',
      jsonb_build_object('00000000-0000-4000-8000-0000000e5105', 'backlog'),
      'partly'
    ) r
  ),
  '3/1/1/1/1/partly',
  'ending stores totals, done, added, carried and backlog counts'
);
select is(
  (select status from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 1),
  'completed',
  'the ended sprint is completed'
);
select is(
  (
    select tct.carry_count
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-0000000e5101' and c.sequence_number = 2
  ),
  1,
  'an open task without a decision carries into the next sprint'
);
select is(
  (select count(*)::int from public.task_assignees where task_id = '00000000-0000-4000-8000-0000000e5101'),
  1,
  'a carried task keeps its owner'
);
select is(
  (select count(*)::int from public.task_assignees where task_id = '00000000-0000-4000-8000-0000000e5105'),
  0,
  'a task sent to the backlog loses its owner'
);
select is(
  (
    select tct.end_decision
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-0000000e5105' and c.sequence_number = 1
  ),
  'backlog',
  'the ended sprint keeps each decision'
);
select is(
  (
    select count(*)::int
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-0000000e5104' and c.sequence_number = 2
  ),
  0,
  'done tasks stay in the sprint they finished in'
);
select is(
  (
    select jsonb_array_length(people)
    from public.task_sprint_reports
    where cycle_id = (select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 1)
  ),
  2,
  'the report keeps per-person totals'
);
select is(
  (public.end_board_sprint((select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and sequence_number = 1))).backlog_tasks,
  1,
  'ending twice returns the stored report'
);

-- Length changes apply to the sprint being planned.
select is(
  (
    select end_date - start_date
    from public.set_board_sprint_length('00000000-0000-4000-8000-0000000e5020', 1::smallint)
  ),
  4,
  'a one-week sprint runs Monday to Friday'
);

-- Leaving the board leaves its sprints.
update public.tasks
set list_id = (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5021' and status = 'active' limit 1)
where id = '00000000-0000-4000-8000-0000000e5101';
select is(
  (
    select count(*)::int
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    where tct.task_id = '00000000-0000-4000-8000-0000000e5101' and c.status in ('planned', 'active')
  ),
  0,
  'moving a task to another board drops its open sprint'
);

-- Turning sprints off keeps history and stops auto-joining.
select lives_ok(
  $$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e5020', null)$$,
  'turning sprints off succeeds'
);
insert into public.tasks (id, name, list_id) values
  ('00000000-0000-4000-8000-0000000e5106', 'After sprints off', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e5020' and status = 'active' limit 1));
select is(
  (select count(*)::int from public.task_cycle_tasks where task_id = '00000000-0000-4000-8000-0000000e5106'),
  0,
  'new tasks skip sprints while sprints are off'
);

-- Members cannot write board sprints or call the RPCs directly.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000e5002', true);

select throws_ok(
  $$insert into public.task_cycles (name, ws_id, board_id, sequence_number, status)
    values ('Sprint 9', '00000000-0000-4000-8000-0000000e5010', '00000000-0000-4000-8000-0000000e5020', 9, 'planned')$$,
  '42501',
  null,
  'members cannot insert board sprints directly'
);
select throws_ok(
  $$select public.start_board_sprint((select id from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e5020' and status = 'planned'))$$,
  '42501',
  null,
  'members cannot call the sprint RPCs'
);

reset role;

select * from finish();
rollback;
