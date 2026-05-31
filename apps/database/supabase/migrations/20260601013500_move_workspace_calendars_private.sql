-- Move workspace calendar source metadata off the public Data API surface.
--
-- Calendar APIs remain the owning boundary. Calendar source rows are read and
-- written with service-role private schema access after workspace membership
-- and app-session authorization are verified by apps/web.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.workspace_calendars
  set schema private;

revoke all on table private.workspace_calendars
from public, anon, authenticated;

grant all on table private.workspace_calendars
to service_role;

alter table private.workspace_calendars enable row level security;

drop policy if exists "workspace_calendars_select"
  on private.workspace_calendars;

drop policy if exists "workspace_calendars_insert"
  on private.workspace_calendars;

drop policy if exists "workspace_calendars_update"
  on private.workspace_calendars;

drop policy if exists "workspace_calendars_delete"
  on private.workspace_calendars;

drop policy if exists "Service role can manage private workspace calendars"
  on private.workspace_calendars;

create policy "Service role can manage private workspace calendars"
  on private.workspace_calendars
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.workspace_calendars is
  'Private workspace calendar source metadata served through apps/web calendar APIs.';

notify pgrst, 'reload schema';
