begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
set local role service_role;
select plan(33);

-- Returns the error a statement raises, or null when it succeeds.
create function pg_temp.error_of(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-0000000e6001', 'Horizon Owner')
on conflict (id) do nothing;
insert into public.workspaces (id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-0000000e6010', 'Horizon Workspace', '00000000-0000-4000-8000-0000000e6001', false)
on conflict (id) do nothing;
insert into public.workspaces (id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-0000000e6011', 'Other Workspace', '00000000-0000-4000-8000-0000000e6001', false)
on conflict (id) do nothing;
insert into public.workspace_boards (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e6020', '00000000-0000-4000-8000-0000000e6010', 'Horizon Board', '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6021', '00000000-0000-4000-8000-0000000e6010', 'No Sprints Board', '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6022', '00000000-0000-4000-8000-0000000e6011', 'Other Board', '00000000-0000-4000-8000-0000000e6001')
on conflict (id) do nothing;

create temp view horizon as
  select sequence_number as seq, status, start_date, end_date
  from public.task_cycles
  where board_id = '00000000-0000-4000-8000-0000000e6020'
    and status in ('planned', 'active')
    and deleted is not true;
grant select on horizon to service_role;

create function pg_temp.sprint(seq int)
returns uuid
language sql
as $$
  select id from public.task_cycles
  where board_id = '00000000-0000-4000-8000-0000000e6020' and sequence_number = seq;
$$;

create function pg_temp.sprints_of(task uuid)
returns text
language sql
as $$
  select coalesce(string_agg(c.sequence_number::text, ',' order by c.sequence_number), '')
  from public.task_cycle_tasks tct
  join public.task_cycles c on c.id = tct.cycle_id
  where tct.task_id = task and c.status in ('planned', 'active');
$$;

-- Turning sprints on gives one planned sprint; more can be planned ahead.
select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 2::smallint, '00000000-0000-4000-8000-0000000e6001');
select public.add_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', null);
select public.add_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', null);
select public.add_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', null);
select is(
  (select string_agg(seq || ':' || status, ',' order by seq) from horizon),
  '1:planned,2:planned,3:planned,4:planned',
  'a board plans several sprints ahead'
);
select is(
  (select count(*)::int from horizon h
   join horizon prev on prev.seq = h.seq - 1
   where h.start_date = prev.end_date + 3 and h.end_date - h.start_date = 11),
  3,
  'each planned sprint starts the Monday after the one before it ends'
);

-- Only the earliest planned sprint starts.
select is(
  pg_temp.error_of(format('select public.start_board_sprint(%L, null)', pg_temp.sprint(2))),
  'SPRINT_NOT_NEXT',
  'a later planned sprint cannot start before the next one'
);
select lives_ok(
  format('select public.start_board_sprint(%L, null)', pg_temp.sprint(1)),
  'the next sprint starts'
);
select is(
  (select string_agg(seq || ':' || status, ',' order by seq) from horizon),
  '1:active,2:planned,3:planned,4:planned',
  'starting keeps the planned sprints and adds none'
);
select is(
  (select h.start_date from horizon h where h.seq = 2),
  (select h.end_date + 3 from horizon h where h.seq = 1),
  'the planned sprints follow the started sprint''s end'
);
select is(
  (select count(*)::int from horizon h
   join horizon prev on prev.seq = h.seq - 1
   where h.seq > 2 and h.start_date = prev.end_date + 3),
  2,
  'and stay chained to each other'
);

-- Five open sprints at most, the running one included.
select lives_ok(
  $$select public.add_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', null)$$,
  'a fifth open sprint can be added'
);
select is(
  pg_temp.error_of($$select public.add_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', null)$$),
  'SPRINT_LIMIT_REACHED',
  'a sixth open sprint is refused'
);

-- A task can go to any open sprint, or to none.
insert into public.tasks (id, name, list_id, creator_id) values
  ('00000000-0000-4000-8000-0000000e6101', 'Far ahead', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1), '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6102', 'Parked', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1), '00000000-0000-4000-8000-0000000e6001');
select is(
  pg_temp.sprints_of('00000000-0000-4000-8000-0000000e6101'),
  '1',
  'a new task joins the running sprint'
);
select public.move_tasks_to_board_sprint('00000000-0000-4000-8000-0000000e6020', array['00000000-0000-4000-8000-0000000e6101']::uuid[], pg_temp.sprint(4));
select is(
  pg_temp.sprints_of('00000000-0000-4000-8000-0000000e6101'),
  '4',
  'a task moves to a sprint further ahead'
);
select public.move_tasks_to_board_sprint('00000000-0000-4000-8000-0000000e6020', array['00000000-0000-4000-8000-0000000e6102']::uuid[], null);
select is(
  pg_temp.sprints_of('00000000-0000-4000-8000-0000000e6102'),
  '',
  'a task can sit in no sprint'
);
select is(
  (select array_agg(id) from public.list_board_unplanned_task_ids('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020') as id),
  array['00000000-0000-4000-8000-0000000e6102']::uuid[],
  'the board lists its open tasks that sit in no sprint'
);

-- Changing the length moves the planned dates and leaves parked tasks parked.
select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6020', 1::smallint, null);
select is(
  (select count(*)::int from horizon where status = 'planned' and end_date - start_date = 4),
  4,
  'a new length applies to every planned sprint'
);
select is(
  pg_temp.sprints_of('00000000-0000-4000-8000-0000000e6102'),
  '',
  'a length change does not pull parked tasks into a sprint'
);

-- Removing: only the last planned sprint, and one planned sprint stays.
select is(
  pg_temp.error_of(format('select public.remove_board_sprint(%L, %L, %L, null)', '00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', pg_temp.sprint(3))),
  'SPRINT_NOT_LAST',
  'a planned sprint with later ones cannot be removed'
);
select is(
  pg_temp.error_of(format('select public.remove_board_sprint(%L, %L, %L, null)', '00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', pg_temp.sprint(1))),
  'SPRINT_NOT_PLANNED',
  'the running sprint cannot be removed'
);
select lives_ok(
  format('select public.remove_board_sprint(%L, %L, %L, null)', '00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', pg_temp.sprint(5)),
  'the last planned sprint is removed'
);
select lives_ok(
  format('select public.remove_board_sprint(%L, %L, %L, null)', '00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', pg_temp.sprint(4)),
  'and the one before it'
);
select is(
  pg_temp.sprints_of('00000000-0000-4000-8000-0000000e6101'),
  '3',
  'a removed sprint''s tasks move to the sprint before it'
);
select public.add_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', null);
select is(
  (select max(seq) from horizon),
  4,
  'a sprint added after a removal takes the next free number'
);

-- Ending carries work to the earliest planned sprint.
insert into public.tasks (id, name, list_id, creator_id) values
  ('00000000-0000-4000-8000-0000000e6103', 'Unfinished', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1), '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6104', 'Finished', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1), '00000000-0000-4000-8000-0000000e6001');
update public.tasks
set list_id = (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'done' limit 1)
where id = '00000000-0000-4000-8000-0000000e6104';
select public.end_board_sprint(pg_temp.sprint(1), null, '{}'::jsonb, null);
select is(
  pg_temp.sprints_of('00000000-0000-4000-8000-0000000e6103'),
  '2',
  'ending carries open work to the earliest planned sprint'
);
select is(
  (select string_agg(seq || ':' || status, ',' order by seq) from horizon),
  '2:planned,3:planned,4:planned',
  'ending adds no sprint when one is planned'
);

-- With nothing running, reopened work rejoins the earliest planned sprint.
update public.tasks
set list_id = (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1)
where id = '00000000-0000-4000-8000-0000000e6104';
select is(
  pg_temp.sprints_of('00000000-0000-4000-8000-0000000e6104'),
  '2',
  'a reopened task rejoins the earliest planned sprint'
);
select is(
  pg_temp.error_of(format('select public.start_board_sprint(%L, null)', pg_temp.sprint(3))),
  'SPRINT_NOT_NEXT',
  'with nothing running, a later sprint still waits its turn'
);

-- One planned sprint always stays.
select public.remove_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', pg_temp.sprint(4), null);
select public.remove_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', pg_temp.sprint(3), null);
select is(
  pg_temp.error_of(format('select public.remove_board_sprint(%L, %L, %L, null)', '00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6020', pg_temp.sprint(2))),
  'SPRINT_ONLY_PLANNED',
  'the only planned sprint cannot be removed'
);
select is(
  pg_temp.sprints_of('00000000-0000-4000-8000-0000000e6101'),
  '2',
  'removed sprints hand their tasks down to the next sprint'
);
select is(
  pg_temp.error_of($$select public.add_board_sprint('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6021', null)$$),
  'SPRINTS_OFF',
  'a board without sprints cannot add one'
);

-- Ids from another workspace or board are refused, and change nothing.
select public.set_board_sprint_length('00000000-0000-4000-8000-0000000e6022', 2::smallint, null);
create temp table horizon_before as
  select string_agg(seq || ':' || status, ',' order by seq) as sprints from horizon;
grant select on horizon_before to service_role;
select is(
  pg_temp.error_of($$select public.add_board_sprint('00000000-0000-4000-8000-0000000e6011', '00000000-0000-4000-8000-0000000e6020', null)$$),
  'SPRINT_BOARD_NOT_FOUND',
  'adding a sprint refuses a board from another workspace'
);
select is(
  pg_temp.error_of(format('select public.remove_board_sprint(%L, %L, %L, null)', '00000000-0000-4000-8000-0000000e6011', '00000000-0000-4000-8000-0000000e6020', pg_temp.sprint(2))),
  'SPRINT_BOARD_NOT_FOUND',
  'removing a sprint refuses a board from another workspace'
);
select is(
  pg_temp.error_of(format('select public.remove_board_sprint(%L, %L, %L, null)', '00000000-0000-4000-8000-0000000e6011', '00000000-0000-4000-8000-0000000e6022', pg_temp.sprint(2))),
  'SPRINT_NOT_FOUND',
  'removing a sprint refuses a sprint from another board'
);
select is(
  pg_temp.error_of($$select public.list_board_unplanned_task_ids('00000000-0000-4000-8000-0000000e6011', '00000000-0000-4000-8000-0000000e6020')$$),
  'SPRINT_BOARD_NOT_FOUND',
  'listing parked tasks refuses a board from another workspace'
);
select is(
  (select string_agg(seq || ':' || status, ',' order by seq) from horizon),
  (select sprints from horizon_before),
  'refused calls leave the board''s sprints as they were'
);

select * from finish();
rollback;
