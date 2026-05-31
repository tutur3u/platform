-- Move scheduling-run metadata off the public Data API surface.
--
-- The calendar schedule API is the owning boundary for this table. Runtime
-- reads and writes now go through service-role private schema access instead of
-- exposing the table or helper RPC through the public schema.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

drop function if exists public.upsert_scheduling_metadata(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer
);

alter table if exists public.workspace_scheduling_metadata
  set schema private;

revoke all on table private.workspace_scheduling_metadata
from public, anon, authenticated;

grant all on table private.workspace_scheduling_metadata to service_role;

alter table private.workspace_scheduling_metadata enable row level security;

drop policy if exists "Users can view scheduling metadata in their workspaces"
  on private.workspace_scheduling_metadata;

drop policy if exists "Users can update scheduling metadata in their workspaces"
  on private.workspace_scheduling_metadata;

drop policy if exists "Users can insert scheduling metadata in their workspaces"
  on private.workspace_scheduling_metadata;

drop policy if exists "Service role can manage private scheduling metadata"
  on private.workspace_scheduling_metadata;

create policy "Service role can manage private scheduling metadata"
  on private.workspace_scheduling_metadata
  for all
  to service_role
  using (true)
  with check (true);

create or replace function private.upsert_scheduling_metadata(
  p_ws_id uuid,
  p_status text,
  p_message text,
  p_habits_scheduled integer,
  p_tasks_scheduled integer,
  p_events_created integer,
  p_bumped_habits integer,
  p_window_days integer default 30
)
returns private.workspace_scheduling_metadata
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  result private.workspace_scheduling_metadata;
begin
  insert into private.workspace_scheduling_metadata (
    ws_id,
    last_scheduled_at,
    last_status,
    last_message,
    habits_scheduled,
    tasks_scheduled,
    events_created,
    bumped_habits,
    window_days
  ) values (
    p_ws_id,
    now(),
    p_status,
    p_message,
    p_habits_scheduled,
    p_tasks_scheduled,
    p_events_created,
    p_bumped_habits,
    p_window_days
  )
  on conflict (ws_id) do update set
    last_scheduled_at = now(),
    last_status = excluded.last_status,
    last_message = excluded.last_message,
    habits_scheduled = excluded.habits_scheduled,
    tasks_scheduled = excluded.tasks_scheduled,
    events_created = excluded.events_created,
    bumped_habits = excluded.bumped_habits,
    window_days = excluded.window_days,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function private.upsert_scheduling_metadata(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function private.upsert_scheduling_metadata(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer
) to service_role;

comment on table private.workspace_scheduling_metadata is
  'Private scheduling-run metadata owned by the calendar schedule API.';

comment on column private.workspace_scheduling_metadata.last_status is
  'Status of last schedule run: success, partial (some items failed), or failed';

comment on column private.workspace_scheduling_metadata.bumped_habits is
  'Number of habit events that were bumped by urgent tasks';

comment on function private.upsert_scheduling_metadata(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer
) is
  'Service-role helper that updates or inserts private scheduling metadata after a scheduling run.';

notify pgrst, 'reload schema';
