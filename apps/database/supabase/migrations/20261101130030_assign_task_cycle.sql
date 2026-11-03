-- One cycle per task, enforced in the write path instead of a table index.
--
-- A unique index on task_cycle_tasks(task_id) would fail to build, or block
-- the migration chain, wherever duplicate links already exist, and checking
-- for them means reading every workspace's rows. This function moves a task
-- into a cycle in one transaction instead:
--   1. lock the task's own row (concurrent assigns of the same task wait for
--      each other; assigns of different tasks never contend);
--   2. check that the task's board workspace equals the cycle's workspace;
--   3. delete every existing link of that task;
--   4. insert the new link.
-- Under READ COMMITTED (the Data API default) the waiting assign's DELETE
-- runs on a fresh snapshot after the first one commits, so it removes that
-- link too and exactly one link remains. A waiter gives up after the
-- function's lock_timeout with SQLSTATE 55P03, which the API reports as a
-- retryable 409.
--
-- SECURITY INVOKER: RLS and table grants apply to the caller. Only the
-- Tasks API (service_role, after its own workspace and permission checks)
-- may execute it. Existing duplicate links are not cleaned up here; the next
-- assign of an affected task replaces them, and reads pick the newest link.
-- Rollback: apps/database/rollbacks/20261101130030_assign_task_cycle.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.assign_task_cycle(
  p_task_id uuid,
  p_cycle_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_task_ws_id uuid;
  v_cycle_ws_id uuid;
begin
  if p_task_id is null or p_cycle_id is null then
    raise exception 'Task and cycle are required'
      using errcode = '22004';
  end if;

  perform 1
  from public.tasks t
  where t.id operator(pg_catalog.=) p_task_id
  for update;

  if not found then
    raise exception 'Task not found'
      using errcode = 'P0002';
  end if;

  select tc.ws_id
  into v_cycle_ws_id
  from public.task_cycles tc
  where tc.id operator(pg_catalog.=) p_cycle_id;

  if v_cycle_ws_id is null then
    raise exception 'Cycle not found'
      using errcode = 'P0002';
  end if;

  select wb.ws_id
  into v_task_ws_id
  from public.tasks t
  join public.task_lists tl on tl.id operator(pg_catalog.=) t.list_id
  join public.workspace_boards wb on wb.id operator(pg_catalog.=) tl.board_id
  where t.id operator(pg_catalog.=) p_task_id;

  if v_task_ws_id is null
    or v_task_ws_id operator(pg_catalog.<>) v_cycle_ws_id then
    raise exception 'Task and cycle must belong to the same workspace'
      using errcode = '42501';
  end if;

  delete from public.task_cycle_tasks tct
  where tct.task_id operator(pg_catalog.=) p_task_id;

  insert into public.task_cycle_tasks (task_id, cycle_id)
  values (p_task_id, p_cycle_id);
end;
$$;

comment on function public.assign_task_cycle(uuid, uuid) is
  'Moves a task into a cycle, replacing all of its existing cycle links, under a row lock on the task. Refuses cross-workspace links (42501) and missing tasks or cycles (P0002).';

revoke all on function public.assign_task_cycle(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_task_cycle(uuid, uuid)
  to service_role;

reset statement_timeout;
reset lock_timeout;
