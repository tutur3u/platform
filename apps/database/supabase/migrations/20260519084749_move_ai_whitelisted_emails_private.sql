-- Move the AI email whitelist off the public Data API surface.
--
-- Consumers should go through apps/web routes or server components, which read
-- this table through the server-side Postgres connection instead of Supabase
-- REST/PostgREST.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.ai_whitelisted_emails
  set schema private;

revoke all on table private.ai_whitelisted_emails
from public, anon, authenticated;

grant all on table private.ai_whitelisted_emails to service_role;

alter table private.ai_whitelisted_emails enable row level security;

drop policy if exists "Service role can manage AI whitelisted emails"
  on private.ai_whitelisted_emails;

create policy "Service role can manage AI whitelisted emails"
  on private.ai_whitelisted_emails
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.ai_whitelisted_emails is
  'Private AI email whitelist. Read and mutate through apps/web APIs or server-only database helpers, not Supabase REST clients.';
