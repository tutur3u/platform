-- One workspace cycle per task, enforced in the write path instead of a
-- table index.
--
-- Scope: workspace cycles only (task_cycles.board_id IS NULL). Board sprints
-- (board_id set, 20261101100000-030) keep one task_cycle_tasks row per sprint
-- on purpose: completed sprints keep their history rows (carry_count,
-- end_decision, added_after_start) and the open sprint row is managed by the
-- sprint functions and the sync_task_board_sprint_membership trigger. This
-- function never reads, deletes or creates board-sprint rows.
--
-- A unique index on task_cycle_tasks(task_id) would fail to build, or block
-- the migration chain, wherever duplicate links already exist (and board
-- sprints need several rows per task anyway). This function moves a task into
-- a workspace cycle in one transaction instead:
--   1. lock the task's own row FOR NO KEY UPDATE: concurrent assigns of the
--      same task wait for each other, assigns of different tasks never
--      contend, and foreign-key inserts that reference the task (FOR KEY
--      SHARE: sprint moves, assignees, labels) are not blocked;
--   2. refuse a missing or deleted cycle (P0002), a board sprint (22023) and
--      a task whose board workspace differs from the cycle's (42501);
--   3. delete the task's links to workspace cycles (board_id IS NULL) only;
--   4. insert the new link.
-- Under READ COMMITTED (the Data API default) the waiting assign's DELETE
-- runs on a fresh snapshot after the first one commits, so it removes that
-- link too and exactly one workspace-cycle link remains. A waiter gives up
-- after the function's lock_timeout with SQLSTATE 55P03, which the API
-- reports as a retryable 409 (as it does a 40P01 deadlock).
--
-- SECURITY INVOKER: RLS and table grants apply to the caller. Only the
-- Tasks API (service_role, after its own workspace and permission checks)
-- may execute it. Existing duplicate links are not cleaned up here; the next
-- assign of an affected task replaces them, and the planning reads and cycle
-- counts use only the newest link to a live workspace cycle.
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
  v_cycle_board_id uuid;
  v_cycle_deleted boolean;
begin
  if p_task_id is null or p_cycle_id is null then
    raise exception 'Task and cycle are required'
      using errcode = '22004';
  end if;

  perform 1
  from public.tasks t
  where t.id operator(pg_catalog.=) p_task_id
  for no key update;

  if not found then
    raise exception 'Task not found'
      using errcode = 'P0002';
  end if;

  select tc.ws_id, tc.board_id, tc.deleted
  into v_cycle_ws_id, v_cycle_board_id, v_cycle_deleted
  from public.task_cycles tc
  where tc.id operator(pg_catalog.=) p_cycle_id;

  if v_cycle_ws_id is null or v_cycle_deleted is true then
    raise exception 'Cycle not found'
      using errcode = 'P0002';
  end if;

  if v_cycle_board_id is not null then
    raise exception 'Board sprints are managed by the board sprint functions'
      using errcode = '22023';
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

  -- Workspace-cycle links only; board-sprint rows are left alone.
  delete from public.task_cycle_tasks tct
  using public.task_cycles c
  where c.id operator(pg_catalog.=) tct.cycle_id
    and c.board_id is null
    and tct.task_id operator(pg_catalog.=) p_task_id;

  insert into public.task_cycle_tasks (task_id, cycle_id)
  values (p_task_id, p_cycle_id);
end;
$$;

comment on function public.assign_task_cycle(uuid, uuid) is
  'Moves a task into a workspace cycle (board_id IS NULL), replacing its other workspace-cycle links, under a FOR NO KEY UPDATE lock on the task. Board-sprint rows are never touched. Refuses board sprints (22023), missing or deleted cycles and missing tasks (P0002), and cross-workspace links (42501).';

revoke all on function public.assign_task_cycle(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_task_cycle(uuid, uuid)
  to service_role;

reset statement_timeout;
reset lock_timeout;
