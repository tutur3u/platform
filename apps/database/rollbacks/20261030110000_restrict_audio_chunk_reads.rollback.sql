begin;

-- Restores workspace-member read access to audio chunk metadata. Playback still
-- requires the participant, host or admin check in the API.
drop policy if exists legacy_audio_chunk_select_participant on public.audio_chunks;

commit;
