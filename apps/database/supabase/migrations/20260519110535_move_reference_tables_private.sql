-- Move low-consumer reference tables off the public Data API surface.
--
-- These tables are retained for historical foreign-key compatibility and
-- administrative/server-side workflows. Runtime consumers should use app APIs or
-- package constants instead of Supabase REST/PostgREST access to public tables.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.currencies
  set schema private;

alter table if exists public.field_types
  set schema private;

alter table if exists public.team_members
  set schema private;

revoke all on table private.currencies
from public, anon, authenticated;

revoke all on table private.field_types
from public, anon, authenticated;

revoke all on table private.team_members
from public, anon, authenticated;

grant all on table private.currencies to service_role;
grant all on table private.field_types to service_role;
grant all on table private.team_members to service_role;

alter table private.currencies enable row level security;
alter table private.field_types enable row level security;
alter table private.team_members enable row level security;

drop policy if exists "Service role can manage private currencies"
  on private.currencies;

create policy "Service role can manage private currencies"
  on private.currencies
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage private field types"
  on private.field_types;

create policy "Service role can manage private field types"
  on private.field_types
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage legacy team members"
  on private.team_members;

create policy "Service role can manage legacy team members"
  on private.team_members
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.currencies is
  'Private reference table retained for finance foreign keys. Runtime consumers should use app APIs or package currency constants instead of Supabase REST.';

comment on table private.field_types is
  'Private reference table retained for workspace user field foreign keys. Manage through centralized app APIs only.';

comment on table private.team_members is
  'Private legacy team membership table retained for historical foreign keys. Active team membership flows use workspace or Nova team tables.';
