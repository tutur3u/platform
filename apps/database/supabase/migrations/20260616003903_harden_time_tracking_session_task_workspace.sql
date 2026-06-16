-- Prevent time-tracking sessions from linking to tasks in another workspace.
-- Existing mismatched links are cleared before the trigger starts enforcing new
-- inserts and updates.

update public.time_tracking_sessions as session
set
  task_id = null,
  updated_at = now()
where
  session.task_id is not null
  and not exists (
    select 1
    from public.tasks as task
    join public.task_lists as list on list.id = task.list_id
    join public.workspace_boards as board on board.id = list.board_id
    where
      task.id = session.task_id
      and board.ws_id = session.ws_id
  );

create or replace function public.enforce_time_tracking_session_task_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.task_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.tasks as task
    join public.task_lists as list on list.id = task.list_id
    join public.workspace_boards as board on board.id = list.board_id
    where
      task.id = new.task_id
      and board.ws_id = new.ws_id
  ) then
    raise exception
      'time tracking session task must belong to the session workspace'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_time_tracking_session_task_workspace()
from public;

drop trigger if exists enforce_time_tracking_session_task_workspace_trigger
on public.time_tracking_sessions;

create trigger enforce_time_tracking_session_task_workspace_trigger
before insert or update of task_id, ws_id on public.time_tracking_sessions
for each row
execute function public.enforce_time_tracking_session_task_workspace();

comment on function public.enforce_time_tracking_session_task_workspace()
is 'Ensures time-tracking session task links stay within the session workspace.';
