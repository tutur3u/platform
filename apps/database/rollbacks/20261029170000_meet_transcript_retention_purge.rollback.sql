-- Prefer the stop fence in production: set fence_open = false and
-- delete_enabled = false on private.meet_transcript_purge_control and remove
-- meet-transcript-retention from CRON_CONTROL_ENABLED_JOBS. Reversal drops the
-- run audit and the purge markers; data already purged is not restored.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop function private.finish_meet_transcript_purge_run(uuid, text);
drop function private.purge_meet_transcripts_batch(uuid, integer);
drop function private.start_meet_transcript_purge_run();
drop table private.meet_transcript_purge_runs;
drop table private.meet_transcript_purge_control;
drop index private.recording_transcripts_retention_idx;
drop index public.meet_ai_sessions_transcript_retention_idx;
alter table public.meet_ai_sessions drop column transcript_purged_at;
commit;
