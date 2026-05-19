-- Move low-use legacy profile and healthcare tables off the public Data API surface.
--
-- These tables are retained for historical compatibility and server-side
-- workflows. Keeping them in private reduces the Supabase REST/PostgREST public
-- schema surface while centralized app routes and service-role jobs continue to
-- own any runtime access.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.personal_notes
  set schema private;

alter table if exists public.healthcare_diagnoses
  set schema private;

revoke all on table private.personal_notes
from public, anon, authenticated;

revoke all on table private.healthcare_diagnoses
from public, anon, authenticated;

grant all on table private.personal_notes to service_role;
grant all on table private.healthcare_diagnoses to service_role;

alter table private.personal_notes enable row level security;
alter table private.healthcare_diagnoses enable row level security;

drop policy if exists "Service role can manage private personal notes"
  on private.personal_notes;

create policy "Service role can manage private personal notes"
  on private.personal_notes
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage private healthcare diagnoses"
  on private.healthcare_diagnoses;

create policy "Service role can manage private healthcare diagnoses"
  on private.healthcare_diagnoses
  for all
  to service_role
  using (true)
  with check (true);

drop function if exists public.get_healthcare_diagnoses_count(uuid);

create function public.get_healthcare_diagnoses_count(p_ws_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select count(*)
  from private.healthcare_diagnoses
  where healthcare_diagnoses.ws_id = p_ws_id;
$$;

revoke all on function public.get_healthcare_diagnoses_count(uuid)
from public, anon, authenticated;

grant execute on function public.get_healthcare_diagnoses_count(uuid)
to service_role;

comment on table private.personal_notes is
  'Private legacy per-user notes table retained for historical compatibility. Runtime personal task notes use centralized app flows.';

comment on table private.healthcare_diagnoses is
  'Private legacy healthcare diagnoses table retained for historical foreign keys. Access through centralized app APIs or service-role jobs only.';

comment on function public.get_healthcare_diagnoses_count(uuid) is
  'Service-role helper for legacy healthcare diagnosis counts after healthcare_diagnoses moved to the private schema.';
