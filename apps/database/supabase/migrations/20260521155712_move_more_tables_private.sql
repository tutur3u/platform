-- Move additional server-owned operational tables out of the exposed public
-- schema. These surfaces are already proxy-only and should be reached through
-- centralized service-role routes or RPCs, not Supabase REST table access.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.workspace_calendar_sync_log
  set schema private;

alter table if exists public.workspace_subscription_errors
  set schema private;

revoke all on table private.workspace_calendar_sync_log
from public, anon, authenticated;

revoke all on table private.workspace_subscription_errors
from public, anon, authenticated;

grant all on table private.workspace_calendar_sync_log to service_role;
grant all on table private.workspace_subscription_errors to service_role;

alter table private.workspace_calendar_sync_log enable row level security;
alter table private.workspace_subscription_errors enable row level security;

drop policy if exists "Users can view sync logs for their workspaces"
  on private.workspace_calendar_sync_log;

drop policy if exists "Service role can manage private calendar sync logs"
  on private.workspace_calendar_sync_log;

create policy "Service role can manage private calendar sync logs"
  on private.workspace_calendar_sync_log
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage private subscription errors"
  on private.workspace_subscription_errors;

create policy "Service role can manage private subscription errors"
  on private.workspace_subscription_errors
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.upsert_workspace_subscription_error(
  _ws_id uuid,
  _error_message text,
  _error_source text default 'unknown'
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into private.workspace_subscription_errors (
    ws_id,
    error_message,
    error_source
  )
  values (_ws_id, _error_message, _error_source)
  on conflict (ws_id) where resolved_at is null
  do update set
    error_message = excluded.error_message,
    error_source = excluded.error_source,
    created_at = now();
end;
$$;

alter function public.get_workspace_overview_summary()
  set search_path = public, private, pg_temp;

alter function public.get_workspace_overview(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer
)
  set search_path = public, private, pg_temp;

revoke execute on function public.upsert_workspace_subscription_error(
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.upsert_workspace_subscription_error(
  uuid,
  text,
  text
) to service_role;

comment on table private.workspace_calendar_sync_log is
  'Private operational audit log for calendar sync jobs. Access through service-role infrastructure routes only.';

comment on table private.workspace_subscription_errors is
  'Private subscription failure state used by billing overview RPCs and service-role repair helpers.';
