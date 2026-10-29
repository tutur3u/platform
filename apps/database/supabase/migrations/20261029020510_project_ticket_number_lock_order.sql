-- Take the task's board capacity lock before the project counter row lock.
-- Saving a task locks its board first, then links projects; numbering a new
-- link locked the counter first, so the two could deadlock.
create or replace function private.assign_project_ticket_number()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  board_id uuid;
begin
  select coalesce(task.board_id, list.board_id) into board_id
  from public.tasks task
  left join public.task_lists list on list.id = task.list_id
  where task.id = new.task_id;
  if board_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(board_id::text, 72411));
  end if;
  -- Always allocate server-side; callers cannot supply or reuse a number.
  update public.task_projects set next_ticket_number = next_ticket_number + 1
  where id = new.project_id returning next_ticket_number - 1 into new.ticket_number;
  if not found then raise exception 'PROJECT_TICKET_ALLOCATION_DENIED' using errcode = '42501'; end if;
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$;
revoke all on function private.assign_project_ticket_number() from public, anon, authenticated;
