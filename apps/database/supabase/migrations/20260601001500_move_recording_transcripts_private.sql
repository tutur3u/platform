-- Move recording transcripts off the public Data API surface.
--
-- Meeting recording APIs remain the owning boundary for transcript writes and
-- reads. Transcript rows are now written with service-role private schema access
-- after workspace membership is verified by the request-scoped client.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.recording_transcripts
  set schema private;

revoke all on table private.recording_transcripts
from public, anon, authenticated;

grant all on table private.recording_transcripts to service_role;

alter table private.recording_transcripts enable row level security;

drop policy if exists "Allow workspace members to have full permissions"
  on private.recording_transcripts;

drop policy if exists "Service role can manage private recording transcripts"
  on private.recording_transcripts;

create policy "Service role can manage private recording transcripts"
  on private.recording_transcripts
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.recording_transcripts is
  'Private meeting recording transcripts served through apps/web recording APIs.';

notify pgrst, 'reload schema';
