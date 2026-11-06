begin;

-- Roll back only the meeting/session write fences and recording identity trigger.
-- Retain privilege revokes and authenticated audio access, including the audio
-- ownership fences. A security rollback must not reopen earlier access risks.
drop policy legacy_meeting_update_manager on public.workspace_meetings;
drop policy legacy_meeting_delete_manager on public.workspace_meetings;
drop policy legacy_recording_insert_manager on public.recording_sessions;
drop policy legacy_recording_update_manager on public.recording_sessions;
drop policy legacy_recording_delete_manager on public.recording_sessions;
drop trigger enforce_legacy_recording_identity_immutable on public.recording_sessions;
drop function public.enforce_legacy_recording_identity_immutable();

commit;
