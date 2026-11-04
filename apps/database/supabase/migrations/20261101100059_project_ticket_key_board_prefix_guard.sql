BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Reverse of 20261101100058: a board's ticket prefix may not be set to a
-- project key in the same workspace, so a label like PLA-2 names one task.
-- Only an explicit, changed prefix is checked; a board without a prefix shows
-- TASK-N, which 20261101100058 already keeps off project keys. The check
-- takes the workspace key lock that project key writes use, so a prefix edit
-- and a project key write cannot pass each other.
-- SECURITY INVOKER: board edits run through the server route as the service
-- role. End-user sessions cannot read task_projects, so a direct prefix write
-- from one fails closed instead of skipping the check.
-- Workspace 42529372-c669-4833-bb32-2cab1f4ffd83 is excluded: its projects
-- keep a NULL key and its boards are left alone. Nothing here writes data.
create function private.guard_board_ticket_prefix_project_key()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
    or nullif(btrim(new.ticket_prefix), '') is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.ws_id, new.ticket_prefix) is not distinct from (old.ws_id, old.ticket_prefix) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.ws_id::text, 1984));
  if exists (
    select 1 from public.task_projects project
    where project.ws_id = new.ws_id and project.ticket_key = upper(btrim(new.ticket_prefix))
  ) then
    raise exception 'TASK_BOARD_TICKET_PREFIX_PROJECT_KEY' using errcode = '23505';
  end if;
  return new;
end;
$$;
-- tuturuuu: no-grant (trigger)
revoke all on function private.guard_board_ticket_prefix_project_key() from public, anon, authenticated;
create trigger guard_board_ticket_prefix_project_key before insert or update of ticket_prefix, ws_id on public.workspace_boards
for each row execute function private.guard_board_ticket_prefix_project_key();

COMMIT;
