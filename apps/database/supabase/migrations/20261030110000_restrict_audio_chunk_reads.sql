begin;

-- Recorded audio carries the same spoken content as the transcript. Playback
-- goes through the API, which signs private storage; this keeps the chunk
-- listing (storage paths) from being read by every workspace member. A
-- restrictive policy composes with the existing member policy and can only
-- narrow it: the recorded identity, the meeting host and workspace admins keep
-- read access. Service role bypasses RLS and is unaffected.
drop policy if exists legacy_audio_chunk_select_participant on public.audio_chunks;
create policy legacy_audio_chunk_select_participant on public.audio_chunks
as restrictive for select to authenticated
using (exists (
  select 1 from public.recording_sessions rs
  join public.workspace_meetings m on m.id = rs.meeting_id
  where rs.id = audio_chunks.session_id
    and (rs.user_id = (select auth.uid())
      or m.creator_id = (select auth.uid())
      or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
));

commit;
