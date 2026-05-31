-- Move legacy education access-request records off the public Data API surface.
--
-- No active app route reads this table directly, but keeping it public leaves
-- historical request data exposed through PostgREST. The table and its timestamp
-- trigger helper now live behind the private schema service-role boundary.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

drop trigger if exists workspace_education_access_requests_updated_at
  on public.workspace_education_access_requests;

create or replace function private.update_workspace_education_access_requests_updated_at()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop function if exists public.update_workspace_education_access_requests_updated_at();

alter table if exists public.workspace_education_access_requests
  set schema private;

revoke all on table private.workspace_education_access_requests
from public, anon, authenticated;

grant all on table private.workspace_education_access_requests to service_role;

alter table private.workspace_education_access_requests enable row level security;

drop policy if exists "Allow platform admins to manage requests"
  on private.workspace_education_access_requests;

drop policy if exists "Allow workspace role manager to create requests"
  on private.workspace_education_access_requests;

drop policy if exists "Allow workspace role manager to view requests"
  on private.workspace_education_access_requests;

drop policy if exists "Enable platform admins to update requests"
  on private.workspace_education_access_requests;

drop policy if exists "Enable workspace owners to create requests"
  on private.workspace_education_access_requests;

drop policy if exists "Enable workspace owners to view own requests"
  on private.workspace_education_access_requests;

drop policy if exists "Service role can manage private education access requests"
  on private.workspace_education_access_requests;

create policy "Service role can manage private education access requests"
  on private.workspace_education_access_requests
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists workspace_education_access_requests_updated_at
  on private.workspace_education_access_requests;

create trigger workspace_education_access_requests_updated_at
  before update on private.workspace_education_access_requests
  for each row
  execute function private.update_workspace_education_access_requests_updated_at();

revoke all on function private.update_workspace_education_access_requests_updated_at()
from public, anon, authenticated;

grant execute on function private.update_workspace_education_access_requests_updated_at()
to service_role;

comment on table private.workspace_education_access_requests is
  'Private legacy education access requests retained for historical review data.';

comment on function private.update_workspace_education_access_requests_updated_at() is
  'Private trigger helper that maintains updated_at for education access requests.';

notify pgrst, 'reload schema';
