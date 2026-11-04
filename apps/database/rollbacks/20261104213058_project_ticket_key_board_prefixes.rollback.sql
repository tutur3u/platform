-- Manual rollback only: restores the 20261104213040 key trigger and identity
-- guard, which do not treat board ticket prefixes as taken. Keys re-derived by
-- 20261104213058 keep their new values; nothing is re-keyed back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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
    return new;
  end if;
  base_key := left(regexp_replace(regexp_replace(upper(new.name collate "C"), '[^A-Z0-9]', '', 'g'), '^[0-9]+', ''), 3);
  if length(base_key) < 2 then base_key := 'PRJ'; end if;
  candidate := base_key;
  while exists (select 1 from public.task_projects p where p.ws_id = new.ws_id and p.ticket_key = candidate) loop
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
  elsif new.next_ticket_number < old.next_ticket_number then
    raise exception 'PROJECT_TICKET_COUNTER_CANNOT_DECREASE' using errcode = '23514';
  end if;
  return new;
end;
$$;
-- tuturuuu: no-grant (trigger)
revoke all on function private.protect_project_ticket_identity() from public, anon, authenticated;

COMMIT;
