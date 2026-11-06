begin;

-- Read and INSERT policies stay intact; restrictive write fences compose with
-- membership, account eligibility, and required-MFA policies.
revoke all on table public.workspace_meetings, public.recording_sessions,
  public.audio_chunks from public, anon;
revoke truncate, references, trigger on table public.workspace_meetings,
  public.recording_sessions, public.audio_chunks from authenticated;

alter policy "Allow workspace members to have full permissions"
on public.audio_chunks to authenticated;

create policy legacy_meeting_update_manager on public.workspace_meetings
as restrictive for update to authenticated
using ((creator_id = (select auth.uid()) or public.has_workspace_permission(ws_id, (select auth.uid()), 'admin')))
with check ((creator_id = (select auth.uid()) or public.has_workspace_permission(ws_id, (select auth.uid()), 'admin')));

create policy legacy_meeting_delete_manager on public.workspace_meetings
as restrictive for delete to authenticated
using ((creator_id = (select auth.uid()) or public.has_workspace_permission(ws_id, (select auth.uid()), 'admin')));

create policy legacy_recording_insert_manager on public.recording_sessions
as restrictive for insert to authenticated
with check ((exists (
  select 1 from public.workspace_meetings m
  where m.id = recording_sessions.meeting_id
    and (recording_sessions.user_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
)));

create policy legacy_recording_update_manager on public.recording_sessions
as restrictive for update to authenticated
using ((exists (
  select 1 from public.workspace_meetings m
  where m.id = recording_sessions.meeting_id
    and (recording_sessions.user_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
)))
with check ((exists (
  select 1 from public.workspace_meetings m
  where m.id = recording_sessions.meeting_id
    and (recording_sessions.user_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
)));

create policy legacy_recording_delete_manager on public.recording_sessions
as restrictive for delete to authenticated
using ((exists (
  select 1 from public.workspace_meetings m
  where m.id = recording_sessions.meeting_id
    and (recording_sessions.user_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
)));

-- A writer cannot change which actor or meeting owns an existing recording.
create function public.enforce_legacy_recording_identity_immutable()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.meeting_id is distinct from old.meeting_id then
    raise exception using errcode = '42501', message = 'Recording identity is immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_legacy_recording_identity_immutable()
from public, anon, authenticated;
create trigger enforce_legacy_recording_identity_immutable
before update of user_id, meeting_id on public.recording_sessions
for each row execute function public.enforce_legacy_recording_identity_immutable();

-- Audio fences intentionally survive the paired rollback. Recreate them
-- transactionally so forward/rollback/forward remains repeatable.
drop policy if exists legacy_audio_chunk_insert_manager on public.audio_chunks;
create policy legacy_audio_chunk_insert_manager on public.audio_chunks
as restrictive for insert to authenticated
with check (exists (
  select 1 from public.recording_sessions rs
  join public.workspace_meetings m on m.id = rs.meeting_id
  where rs.id = audio_chunks.session_id
    and (rs.user_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
))
;

-- Audio fences intentionally survive the paired rollback. Recreate them
-- transactionally so forward/rollback/forward remains repeatable.
drop policy if exists legacy_audio_chunk_update_manager on public.audio_chunks;
create policy legacy_audio_chunk_update_manager on public.audio_chunks
as restrictive for update to authenticated
using (exists (
  select 1 from public.recording_sessions rs
  join public.workspace_meetings m on m.id = rs.meeting_id
  where rs.id = audio_chunks.session_id
    and (rs.user_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
))
with check (exists (
  select 1 from public.recording_sessions rs
  join public.workspace_meetings m on m.id = rs.meeting_id
  where rs.id = audio_chunks.session_id
    and (rs.user_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
))
;

-- Audio fences intentionally survive the paired rollback. Recreate them
-- transactionally so forward/rollback/forward remains repeatable.
drop policy if exists legacy_audio_chunk_delete_manager on public.audio_chunks;
create policy legacy_audio_chunk_delete_manager on public.audio_chunks
as restrictive for delete to authenticated
using (exists (
  select 1 from public.recording_sessions rs
  join public.workspace_meetings m on m.id = rs.meeting_id
  where rs.id = audio_chunks.session_id
    and (rs.user_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
))
;

commit;
