-- Move the legacy AI model catalog off the public Data API surface.
--
-- Active model catalog APIs use ai_gateway_models. These legacy tables remain
-- for historical foreign-key compatibility and should not be reachable through
-- Supabase REST/PostgREST.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.ai_providers
  set schema private;

alter table if exists public.ai_models
  set schema private;

revoke all on table private.ai_providers
from public, anon, authenticated;

revoke all on table private.ai_models
from public, anon, authenticated;

grant all on table private.ai_providers to service_role;
grant all on table private.ai_models to service_role;

alter table private.ai_providers enable row level security;
alter table private.ai_models enable row level security;

drop policy if exists "Service role can manage legacy AI providers"
  on private.ai_providers;

create policy "Service role can manage legacy AI providers"
  on private.ai_providers
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage legacy AI models"
  on private.ai_models;

create policy "Service role can manage legacy AI models"
  on private.ai_models
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.ai_providers is
  'Private legacy AI provider catalog retained for historical foreign keys. Active app model APIs should use ai_gateway_models through apps/web routes.';

comment on table private.ai_models is
  'Private legacy AI model catalog retained for historical foreign keys. Active app model APIs should use ai_gateway_models through apps/web routes.';
