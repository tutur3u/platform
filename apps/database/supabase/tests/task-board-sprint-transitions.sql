begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
set local role service_role;
select plan(58);

-- Every way a task can enter, leave or come back to a board's sprints, checked
-- against the rules in apps/docs/platform/features/task-board-sprints.mdx.
insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-0000000e6001', 'Transitions Owner'),
  ('00000000-0000-4000-8000-0000000e6002', 'Transitions Helper')
on conflict (id) do nothing;
insert into public.workspaces (id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-0000000e6010', 'Transitions Workspace', '00000000-0000-4000-8000-0000000e6001', false)
on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6001', 'MEMBER'),
  ('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6002', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
insert into public.workspace_boards (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e6020', '00000000-0000-4000-8000-0000000e6010', 'Sprint Board', '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6021', '00000000-0000-4000-8000-0000000e6010', 'Plain Board', '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6022', '00000000-0000-4000-8000-0000000e6010', 'Second Sprint Board', '00000000-0000-4000-8000-0000000e6001')
on conflict (id) do nothing;

create temporary table board_list (board text, kind text, id uuid) on commit drop;
insert into board_list
select
  case board_id
    when '00000000-0000-4000-8000-0000000e6020' then 'sprint'
    when '00000000-0000-4000-8000-0000000e6021' then 'plain'
    else 'second'
  end,
  status::text,
  (array_agg(id order by position, id))[1]
from public.task_lists
where board_id in (
  '00000000-0000-4000-8000-0000000e6020',
  '00000000-0000-4000-8000-0000000e6021',
  '00000000-0000-4000-8000-0000000e6022'
)
group by board_id, status;
grant select on board_list to service_role;

create function pg_temp.list_id(p_board text, p_kind text)
returns uuid language sql stable as $$
  select id from board_list where board = p_board and kind = p_kind
$$;
-- The task's open sprint on its board as "N:status:added", or 'none'.
create function pg_temp.open_sprint(p_task uuid)
returns text language sql stable as $$
  select coalesce((
    select c.sequence_number || ':' || c.status || ':' || tct.added_after_start
    from public.task_cycle_tasks tct
    join public.task_cycles c on c.id = tct.cycle_id
    join public.tasks t on t.id = tct.task_id
    where tct.task_id = p_task
      and c.board_id = t.board_id
      and c.status in ('planned', 'active')
      and c.deleted is not true
  ), 'none')
$$;
create function pg_temp.sprint_id(p_board uuid, p_sequence int)
returns uuid language sql stable as $$
  select id from public.task_cycles where board_id = p_board and sequence_number = p_sequence
$$;

select ok(
  pg_temp.list_id('sprint', 'active') is not null
    and pg_temp.list_id('sprint', 'done') is not null
    and pg_temp.list_id('plain', 'active') is not null
    and pg_temp.list_id('second', 'active') is not null,
  'fixture boards have open and done lists'
);

-- Sprints on for the main and second boards; the plain board stays off.
select lives_ok($$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 2::smallint, '00000000-0000-4000-8000-0000000e6001')$$, 'sprints on, two weeks');
select lives_ok($$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6022', 1::smallint, '00000000-0000-4000-8000-0000000e6001')$$, 'second board sprints on, one week');
select lives_ok($$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 2::smallint, '00000000-0000-4000-8000-0000000e6001')$$, 'turning sprints on twice is harmless');
select is(
  (select count(*)::int from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'planned'),
  1,
  'still one planned sprint after turning sprints on twice'
);

insert into public.tasks (id, name, list_id, estimation_points, creator_id) values
  ('00000000-0000-4000-8000-0000000e6101', 'Finishes in sprint 1', pg_temp.list_id('sprint', 'active'), 3, '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6102', 'Carried twice', pg_temp.list_id('sprint', 'active'), 2, '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6103', 'Sent to backlog', pg_temp.list_id('sprint', 'active'), 1, '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6104', 'Deleted before the end', pg_temp.list_id('sprint', 'active'), null, '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6105', 'Closed before the end', pg_temp.list_id('sprint', 'active'), null, '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6106', 'Done before start', pg_temp.list_id('sprint', 'active'), null, '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6107', 'Travels between boards', pg_temp.list_id('sprint', 'active'), null, '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6108', 'Moves between sprints', pg_temp.list_id('sprint', 'active'), null, '00000000-0000-4000-8000-0000000e6001');
insert into public.task_assignees (task_id, user_id) values
  ('00000000-0000-4000-8000-0000000e6102', '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6103', '00000000-0000-4000-8000-0000000e6002');

select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6101'), '1:planned:false', 'new task while planning joins Sprint 1');

-- Within the board: changing lists keeps membership.
update public.tasks set list_id = pg_temp.list_id('sprint', 'done') where id = '00000000-0000-4000-8000-0000000e6106';
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6106'), '1:planned:false', 'finishing a task keeps it in its sprint');
select ok(
  (select completed_at is not null or closed_at is not null from public.tasks where id = '00000000-0000-4000-8000-0000000e6106'),
  'a task in the done list counts as finished'
);

-- Length change applies to the planned sprint.
select is(
  (public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 1::smallint, '00000000-0000-4000-8000-0000000e6001')).end_date
    - (select start_date from public.task_cycles where id = pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1)),
  4,
  'switching to one week shortens the planned sprint to Monday-Friday'
);
select lives_ok($$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 2::smallint, '00000000-0000-4000-8000-0000000e6001')$$, 'back to two weeks');

-- Start Sprint 1.
select is(
  (public.start_board_sprint(pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1), '00000000-0000-4000-8000-0000000e6001')).status,
  'active',
  'Sprint 1 starts'
);
select is(
  (select end_date - start_date from public.task_cycles where id = pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 2)),
  11,
  'Sprint 2 is planned at the current length'
);
select is(
  (public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 1::smallint, '00000000-0000-4000-8000-0000000e6001')).sequence_number,
  2,
  'a length change while running targets the planned sprint'
);
select ok(
  (select end_date - start_date >= 4 from public.task_cycles where id = pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1)),
  'the running sprint keeps its dates when the length changes'
);
select lives_ok($$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 2::smallint, '00000000-0000-4000-8000-0000000e6001')$$, 'back to two weeks while running');

-- Mid-sprint arrivals.
insert into public.tasks (id, name, list_id, estimation_points) values
  ('00000000-0000-4000-8000-0000000e6110', 'Created mid-sprint', pg_temp.list_id('sprint', 'active'), 1),
  ('00000000-0000-4000-8000-0000000e6111', 'Created already done', pg_temp.list_id('sprint', 'done'), 2);
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6110'), '1:active:true', 'a task created mid-sprint joins it flagged as added');
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6111'), '1:active:true', 'a task created straight into Done joins the running sprint');

-- Moving between boards.
update public.tasks set list_id = pg_temp.list_id('plain', 'active') where id = '00000000-0000-4000-8000-0000000e6107';
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6107'), 'none', 'moving to a board without sprints leaves the sprint');
select is(
  (select count(*)::int from public.task_cycle_tasks where task_id = '00000000-0000-4000-8000-0000000e6107'),
  0,
  'no stale membership stays behind on the old board'
);
update public.tasks set list_id = pg_temp.list_id('second', 'active') where id = '00000000-0000-4000-8000-0000000e6107';
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6107'), '1:planned:false', 'moving to another sprint board joins its current sprint');
update public.tasks set list_id = pg_temp.list_id('sprint', 'active') where id = '00000000-0000-4000-8000-0000000e6107';
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6107'), '1:active:true', 'coming back mid-sprint joins the running sprint as added');
select is(
  (select count(*)::int from public.task_cycle_tasks tct join public.task_cycles c on c.id = tct.cycle_id
   where tct.task_id = '00000000-0000-4000-8000-0000000e6107' and c.status in ('planned', 'active')),
  1,
  'a travelling task sits in exactly one open sprint'
);

-- Moving between sprints with the RPC.
select is(
  public.move_tasks_to_board_sprint('00000000-0000-4000-8000-0000000e6020', array['00000000-0000-4000-8000-0000000e6108']::uuid[], pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 2)),
  1,
  'moving a task to the planned sprint moves one task'
);
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6108'), '2:planned:false', 'the task now waits in Sprint 2');
select is(
  public.move_tasks_to_board_sprint('00000000-0000-4000-8000-0000000e6020', array['00000000-0000-4000-8000-0000000e6108']::uuid[], pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1)),
  1,
  'and back into the running sprint'
);
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6108'), '1:active:true', 'pulled into the running sprint counts as added');
select is(
  public.move_tasks_to_board_sprint('00000000-0000-4000-8000-0000000e6020', array[]::uuid[], pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1)),
  0,
  'moving no tasks is a no-op'
);
select throws_ok(
  $$select public.move_tasks_to_board_sprint('00000000-0000-4000-8000-0000000e6020', array['00000000-0000-4000-8000-0000000e6108']::uuid[], pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6022', 1))$$,
  '55000',
  'SPRINT_NOT_OPEN',
  'a sprint from another board is not a target'
);

-- Ending Sprint 1.
update public.tasks set list_id = pg_temp.list_id('sprint', 'done') where id = '00000000-0000-4000-8000-0000000e6101';
update public.tasks set deleted_at = now() where id = '00000000-0000-4000-8000-0000000e6104';
update public.tasks set closed_at = now() where id = '00000000-0000-4000-8000-0000000e6105';

select throws_ok(
  $$select public.end_board_sprint(pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 2))$$,
  '55000',
  'SPRINT_NOT_ACTIVE',
  'only the running sprint can end'
);
select throws_ok(
  format(
    $$select public.end_board_sprint(%L, null, '{"%s": "drop"}'::jsonb)$$,
    pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1),
    '00000000-0000-4000-8000-0000000e6102'
  ),
  '22023',
  'SPRINT_DECISIONS_INVALID',
  'an unknown decision is rejected'
);
select is(
  (select status from public.task_cycles where id = pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1)),
  'active',
  'a rejected end changes nothing'
);
select is(
  (select count(*)::int from public.task_sprint_reports where cycle_id = pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1)),
  0,
  'a rejected end leaves no report'
);

select is(
  (select total_tasks || '/' || done_tasks || '/' || added_tasks || '/' || carried_tasks || '/' || backlog_tasks
   from public.end_board_sprint(
     pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1),
     '00000000-0000-4000-8000-0000000e6001',
     jsonb_build_object('00000000-0000-4000-8000-0000000e6103', 'backlog'),
     'partly'
   )),
  -- 6101 done, 6102 carry, 6103 backlog, 6105 closed, 6106 done before start,
  -- 6107 added, 6108 added, 6110 added, 6111 added and done; 6104 deleted.
  '9/4/4/4/1',
  'the report counts done, added, carried and backlog tasks; deleted ones drop out'
);
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6102'), '2:planned:false', 'a carried task waits in Sprint 2');
select is(
  (select count(*)::int from public.task_assignees where task_id = '00000000-0000-4000-8000-0000000e6102'),
  1,
  'a carried task keeps its owner'
);
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6103'), '2:planned:false', 'a backlog task is in Sprint 2 too');
select is(
  (select count(*)::int from public.task_assignees where task_id = '00000000-0000-4000-8000-0000000e6103'),
  0,
  'sending a task to the backlog removes its owners'
);
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6101'), 'none', 'a done task stays in the sprint it finished in');
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6105'), 'none', 'a closed task is not carried');
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6104'), 'none', 'a deleted task is not carried');
select is(
  (select report.cycle_id from public.end_board_sprint(pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1)) report),
  pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 1),
  'ending again returns the stored report'
);
select is(
  (select count(*)::int from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'planned'),
  1,
  'ending leaves exactly one planned sprint'
);

-- Coming back to work after the sprint ended.
update public.tasks set list_id = pg_temp.list_id('sprint', 'active') where id = '00000000-0000-4000-8000-0000000e6101';
select is(
  (select completed_at is null and closed_at is null from public.tasks where id = '00000000-0000-4000-8000-0000000e6101'),
  true,
  'moving a finished task back to an open list reopens it'
);
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6101'), '2:planned:false', 'a task reopened after its sprint ended joins the sprint being planned');
update public.tasks set deleted_at = null where id = '00000000-0000-4000-8000-0000000e6104';
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6104'), '2:planned:false', 'a task restored after its sprint ended joins the sprint being planned');
update public.tasks set closed_at = null where id = '00000000-0000-4000-8000-0000000e6105';
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6105'), '2:planned:false', 'a closed task reopened later joins the sprint being planned');

-- Sprint 2 runs; carry twice.
select is(
  (public.start_board_sprint(pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 2), '00000000-0000-4000-8000-0000000e6001')).status,
  'active',
  'Sprint 2 starts'
);
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6102'), '2:active:false', 'carried work is committed, not added, when the sprint starts');
select lives_ok(
  format($$select public.end_board_sprint(%L)$$, pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 2)),
  'Sprint 2 ends with every decision defaulting to carry'
);
select is(
  (select tct.carry_count from public.task_cycle_tasks tct where tct.task_id = '00000000-0000-4000-8000-0000000e6102' and tct.cycle_id = pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 3)),
  2,
  'a task carried twice is counted twice'
);
select is(
  (select carried_in_tasks from public.task_sprint_reports where cycle_id = pg_temp.sprint_id('00000000-0000-4000-8000-0000000e6020', 2)) >= 2,
  true,
  'Sprint 2 reports the work carried into it'
);

-- Sprints off and on again.
select lives_ok($$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', null, '00000000-0000-4000-8000-0000000e6001')$$, 'sprints off');
insert into public.tasks (id, name, list_id) values
  ('00000000-0000-4000-8000-0000000e6120', 'Created while sprints are off', pg_temp.list_id('sprint', 'active'));
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6120'), 'none', 'with sprints off a new task joins no sprint');
select is(
  (select count(*)::int from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'completed'),
  2,
  'turning sprints off keeps past sprints'
);
select lives_ok($$select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 2::smallint, '00000000-0000-4000-8000-0000000e6001')$$, 'sprints back on');
select is(pg_temp.open_sprint('00000000-0000-4000-8000-0000000e6120'), '3:planned:false', 'turning sprints back on gathers open tasks into the planned sprint');
select is(
  (select count(*)::int from public.task_cycles where board_id = '00000000-0000-4000-8000-0000000e6020' and status in ('planned', 'active')),
  1,
  'one open sprint after turning sprints back on'
);

-- Every open task on a sprint board is in exactly one open sprint.
select is(
  (
    select count(*)::int
    from public.tasks t
    where t.board_id = '00000000-0000-4000-8000-0000000e6020'
      and t.deleted_at is null
      and t.completed_at is null
      and t.closed_at is null
      and (
        select count(*)
        from public.task_cycle_tasks tct
        join public.task_cycles c on c.id = tct.cycle_id
        where tct.task_id = t.id and c.board_id = t.board_id and c.status in ('planned', 'active')
      ) <> 1
  ),
  0,
  'no open task is lost from, or doubled across, the open sprints'
);

select * from finish();
rollback;
