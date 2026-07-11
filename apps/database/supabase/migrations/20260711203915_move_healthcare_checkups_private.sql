-- Move the remaining legacy healthcare checkup records off the client-facing
-- Data API surface. The feature has no direct application callers; retained
-- server workflows use service-role access and the workspace-user merge path.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.healthcare_checkups set schema private;
alter table public.healthcare_checkup_vitals set schema private;
alter table public.healthcare_checkup_vital_groups set schema private;

revoke all on table
  private.healthcare_checkups,
  private.healthcare_checkup_vitals,
  private.healthcare_checkup_vital_groups
from public, anon, authenticated;

grant all on table
  private.healthcare_checkups,
  private.healthcare_checkup_vitals,
  private.healthcare_checkup_vital_groups
to service_role;

alter table private.healthcare_checkups enable row level security;
alter table private.healthcare_checkup_vitals enable row level security;
alter table private.healthcare_checkup_vital_groups enable row level security;

drop policy if exists "Enable all access for organization members"
  on private.healthcare_checkups;
drop policy if exists "Enable all access for organization members"
  on private.healthcare_checkup_vitals;
drop policy if exists "Enable all access for organization members"
  on private.healthcare_checkup_vital_groups;

create policy "Service role can manage private healthcare checkups"
  on private.healthcare_checkups
  for all to service_role
  using (true)
  with check (true);

create policy "Service role can manage private healthcare checkup vitals"
  on private.healthcare_checkup_vitals
  for all to service_role
  using (true)
  with check (true);

create policy "Service role can manage private healthcare checkup vital groups"
  on private.healthcare_checkup_vital_groups
  for all to service_role
  using (true)
  with check (true);

drop function if exists public.get_healthcare_checkups_count(uuid);

create function public.get_healthcare_checkups_count(p_ws_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select count(*)
  from private.healthcare_checkups
  where healthcare_checkups.ws_id = p_ws_id;
$$;

revoke all on function public.get_healthcare_checkups_count(uuid)
from public, anon, authenticated;
grant execute on function public.get_healthcare_checkups_count(uuid)
to service_role;

alter function public.merge_workspace_users_phase1c(uuid, uuid, uuid)
  set search_path = public, private, pg_temp;
alter function public.merge_workspace_users_phase1c_batch(uuid, uuid, uuid, integer)
  set search_path = public, private, pg_temp;

comment on table private.healthcare_checkups is
  'Private legacy healthcare checkup records retained for historical compatibility and service-role workflows.';
comment on table private.healthcare_checkup_vitals is
  'Private legacy healthcare vital values retained for historical compatibility and service-role workflows.';
comment on table private.healthcare_checkup_vital_groups is
  'Private legacy healthcare vital group links retained for historical compatibility and service-role workflows.';
comment on function public.get_healthcare_checkups_count(uuid) is
  'Service-role helper for legacy healthcare checkup counts after healthcare_checkups moved to the private schema.';
