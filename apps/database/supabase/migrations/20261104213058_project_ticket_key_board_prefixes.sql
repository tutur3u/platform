BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Project keys must not collide with board ticket prefixes in the same
-- workspace, so a label like PLA-2 names one task. A board's effective prefix
-- is its trimmed, upper-cased ticket_prefix, or TASK when it has none (see
-- getTicketIdentifier in @tuturuuu/utils). Generated keys skip those prefixes,
-- and a chosen key that equals one is refused like a duplicate project key.
-- Board prefixes stay as they are; old board ticket IDs still resolve in search.
-- Nothing here writes workspace 42529372-c669-4833-bb32-2cab1f4ffd83: its
-- projects keep a NULL key and are excluded from the re-key below.

-- Re-key projects with a key-changing UPDATE, so detach the identity trigger
-- for the duration of this transaction and reattach it at the end.
drop trigger if exists protect_project_ticket_counter on public.task_projects;

create or replace function private.assign_project_ticket_key()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  base_key text;
  candidate text;
  suffix integer := 1;
begin
  -- Serialize every key write in a workspace, chosen or generated, so a
  -- generated key never races a chosen one into a unique violation.
  perform pg_advisory_xact_lock(hashtextextended(new.ws_id::text, 1984));
  if new.ticket_key is not null then
    -- Choosing a key is project management; members get the derived key.
    if auth.role() = 'authenticated' and
      not coalesce(public.has_workspace_permission(new.ws_id, auth.uid(), 'manage_projects'), false) then
      raise exception 'PROJECT_TICKET_KEY_MANAGEMENT_DENIED' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.workspace_boards board
      where board.ws_id = new.ws_id
        and coalesce(nullif(upper(btrim(board.ticket_prefix)), ''), 'TASK') = new.ticket_key
    ) then
      raise exception 'PROJECT_TICKET_KEY_BOARD_PREFIX' using errcode = '23505';
    end if;
    return new;
  end if;
  base_key := left(regexp_replace(regexp_replace(upper(new.name collate "C"), '[^A-Z0-9]', '', 'g'), '^[0-9]+', ''), 3);
  if length(base_key) < 2 then base_key := 'PRJ'; end if;
  candidate := base_key;
  while exists (select 1 from public.task_projects p where p.ws_id = new.ws_id and p.ticket_key = candidate)
    or exists (
      select 1 from public.workspace_boards board
      where board.ws_id = new.ws_id
        and coalesce(nullif(upper(btrim(board.ticket_prefix)), ''), 'TASK') = candidate
    ) loop
    suffix := suffix + 1;
    candidate := left(base_key, 10 - length(suffix::text)) || suffix::text;
  end loop;
  new.ticket_key := candidate;
  return new;
end;
$$;
-- tuturuuu: no-grant (trigger)
revoke all on function private.assign_project_ticket_key() from public, anon, authenticated;

create or replace function private.protect_project_ticket_identity()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_table_name = 'task_project_tasks' then
    if (new.project_id, new.task_id, new.ticket_number, new.created_at) is distinct from
       (old.project_id, old.task_id, old.ticket_number, old.created_at) then
      raise exception 'PROJECT_TICKET_IDENTITY_IMMUTABLE' using errcode = '23514';
    end if;
  end if;
  -- task_projects only from here (task_project_tasks has no ticket_key).
  if tg_table_name <> 'task_projects' then
    return new;
  end if;
  -- Key edits take the workspace key lock that key assignment uses.
  if new.ticket_key is distinct from old.ticket_key then
    perform pg_advisory_xact_lock(hashtextextended(new.ws_id::text, 1984));
  end if;
  if new.ticket_key is distinct from old.ticket_key and
    auth.role() is distinct from 'service_role' and
    not coalesce(public.has_workspace_permission(new.ws_id, auth.uid(), 'manage_projects'), false) then
    raise exception 'PROJECT_TICKET_KEY_MANAGEMENT_DENIED' using errcode = '42501';
  elsif new.ticket_key is distinct from old.ticket_key and exists (
    select 1 from public.workspace_boards board
    where board.ws_id = new.ws_id
      and coalesce(nullif(upper(btrim(board.ticket_prefix)), ''), 'TASK') = new.ticket_key
  ) then
    raise exception 'PROJECT_TICKET_KEY_BOARD_PREFIX' using errcode = '23505';
  elsif new.next_ticket_number < old.next_ticket_number then
    raise exception 'PROJECT_TICKET_COUNTER_CANNOT_DECREASE' using errcode = '23514';
  end if;
  return new;
end;
$$;
-- tuturuuu: no-grant (trigger)
revoke all on function private.protect_project_ticket_identity() from public, anon, authenticated;

-- Keys assigned by the 20261104213040 backfill ship in the same release as
-- this migration, so re-derive any that equal a board prefix before anyone
-- sees them. Same derivation and suffix rules as the insert trigger, in
-- creation order per workspace. Ticket numbers do not change.
-- tuturuuu: reviewed(dynamic-sql-review): static key derivation loop, no EXECUTE.
do $$
declare
  project record;
  base_key text;
  candidate text;
  suffix integer;
begin
  for project in
    select p.id, p.ws_id, p.name from public.task_projects p
    where p.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
      and p.ticket_key is not null
      and exists (
        select 1 from public.workspace_boards board
        where board.ws_id = p.ws_id
          and coalesce(nullif(upper(btrim(board.ticket_prefix)), ''), 'TASK') = p.ticket_key
      )
    order by p.ws_id, p.created_at nulls last, p.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(project.ws_id::text, 1984));
    base_key := left(regexp_replace(regexp_replace(upper(project.name collate "C"), '[^A-Z0-9]', '', 'g'), '^[0-9]+', ''), 3);
    if length(base_key) < 2 then base_key := 'PRJ'; end if;
    candidate := base_key;
    suffix := 1;
    while exists (select 1 from public.task_projects p where p.ws_id = project.ws_id and p.ticket_key = candidate)
      or exists (
        select 1 from public.workspace_boards board
        where board.ws_id = project.ws_id
          and coalesce(nullif(upper(btrim(board.ticket_prefix)), ''), 'TASK') = candidate
      ) loop
      suffix := suffix + 1;
      candidate := left(base_key, 10 - length(suffix::text)) || suffix::text;
    end loop;
    update public.task_projects set ticket_key = candidate
    where id = project.id and ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid;
  end loop;
end;
$$;

create trigger protect_project_ticket_counter before update of next_ticket_number, ticket_key on public.task_projects
for each row execute function private.protect_project_ticket_identity();

COMMIT;
