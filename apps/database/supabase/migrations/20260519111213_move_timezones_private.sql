-- Move timezone management data off the public Data API surface.
--
-- The dashboard already serves timezone management through apps/web APIs and
-- static package data. Keep the stored synchronization records private so the
-- Supabase REST/PostgREST public schema does not expose another table.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.timezones
  set schema private;

revoke all on table private.timezones
from public, anon, authenticated;

grant all on table private.timezones to service_role;

alter table private.timezones enable row level security;

drop policy if exists "Service role can manage private timezones"
  on private.timezones;

create policy "Service role can manage private timezones"
  on private.timezones
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.timezones is
  'Private timezone synchronization table for infrastructure management. Access through apps/web APIs or server-only helpers, not Supabase REST clients.';
