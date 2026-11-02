-- The run audit is intentionally retained: private.meet_transcript_purge_runs
-- and its rows stay as evidence of what was purged and when. So do
-- meet_ai_sessions.transcript_purged_at and the retention indexes.
--
-- Prefer the stop fence in production: set fence_open = false and
-- delete_enabled = false on private.meet_transcript_purge_control and remove
-- meet-transcript-retention from CRON_CONTROL_ENABLED_JOBS. This reversal only
-- disables future runs by dropping the purge functions and the fence. It cannot
-- restore transcripts or notes that were already deleted.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop function private.finish_meet_transcript_purge_run(uuid, text);
drop function private.purge_meet_transcripts_batch(uuid, integer);
drop function private.start_meet_transcript_purge_run();
drop table private.meet_transcript_purge_control;
commit;
