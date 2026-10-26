-- Guard task-cycle links against cross-workspace tasks.
--
-- The "manage" policy on public.task_cycle_tasks only checks that the caller
-- belongs to the cycle's workspace, so a member could link a task from a
-- different workspace into their own cycle. Service-role writes bypass RLS
-- entirely. This trigger enforces, for every role, that a linked task's board
-- workspace equals the cycle's workspace on INSERT and on UPDATE of either key.
--
-- A second trigger keeps public.task_cycles.ws_id immutable so moving a cycle
-- cannot turn its existing links into cross-workspace links.
--
-- Existing rows are not rewritten or validated here (equivalent to NOT VALID);
-- inspect them with the read-only count in
-- apps/database/verification/task-cycle-cross-workspace-links.sql.
-- Rollback: apps/database/rollbacks/20261027090000_guard_task_cycle_task_workspace.rollback.sql

set lock_timeout = '5s';

create or replace function public.enforce_task_cycle_task_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_cycle_ws_id uuid;
  v_task_ws_id uuid;
begin
  select tc.ws_id
  into v_cycle_ws_id
  from public.task_cycles tc
  where tc.id = new.cycle_id;

  select wb.ws_id
  into v_task_ws_id
  from public.tasks t
  join public.task_lists tl on tl.id = t.list_id
  join public.workspace_boards wb on wb.id = tl.board_id
  where t.id = new.task_id;

  if v_cycle_ws_id is null
    or v_task_ws_id is null
    or v_cycle_ws_id operator(pg_catalog.<>) v_task_ws_id then
    raise exception 'Task and cycle must belong to the same workspace'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_task_cycle_task_workspace()
  from public, anon, authenticated;

create or replace function public.prevent_task_cycle_workspace_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.ws_id is distinct from old.ws_id then
    raise exception 'A task cycle cannot move to another workspace'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_task_cycle_workspace_change()
  from public, anon, authenticated;

drop trigger if exists enforce_task_cycle_task_workspace
  on public.task_cycle_tasks;
create trigger enforce_task_cycle_task_workspace
  before insert or update of task_id, cycle_id on public.task_cycle_tasks
  for each row
  execute function public.enforce_task_cycle_task_workspace();

drop trigger if exists prevent_task_cycle_workspace_change
  on public.task_cycles;
create trigger prevent_task_cycle_workspace_change
  before update of ws_id on public.task_cycles
  for each row
  execute function public.prevent_task_cycle_workspace_change();

reset lock_timeout;
