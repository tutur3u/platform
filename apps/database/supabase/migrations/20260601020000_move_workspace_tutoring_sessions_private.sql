-- Move tutoring session intervention records off the public Data API surface.
--
-- Tutoring APIs remain the owning boundary. Session rows are read and written
-- with service-role private schema access after workspace permissions are
-- verified by apps/web.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.workspace_tutoring_sessions
  set schema private;

revoke all on table private.workspace_tutoring_sessions
from public, anon, authenticated;

grant all on table private.workspace_tutoring_sessions
to service_role;

alter table private.workspace_tutoring_sessions enable row level security;

drop policy if exists "Allow workspace members to view tutoring sessions"
  on private.workspace_tutoring_sessions;

drop policy if exists "Allow workspace members to manage tutoring sessions"
  on private.workspace_tutoring_sessions;

drop policy if exists "Service role can manage private tutoring sessions"
  on private.workspace_tutoring_sessions;

create policy "Service role can manage private tutoring sessions"
  on private.workspace_tutoring_sessions
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.workspace_tutoring_sessions is
  'Private tutoring intervention session records served through apps/web tutoring APIs.';

notify pgrst, 'reload schema';
