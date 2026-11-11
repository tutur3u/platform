-- The counts-only run log is intentionally retained: private.ai_studio_retention_runs
-- and its rows stay as evidence of what was counted or deleted and when.
--
-- Prefer the operational stops first: POST /control/jobs/ai-studio-retention/stop
-- (operator token), set AI_STUDIO_RETENTION_MODE back to dry-run or off, or
-- remove ai-studio-retention from CRON_CONTROL_ENABLED_JOBS. This reversal only
-- disables future runs by dropping the preview, batch and log functions; the
-- original private.cleanup_ai_studio_retention() is untouched. It cannot restore
-- rows that were already deleted; only the pre-purge backup can.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop function private.record_ai_studio_retention_run(
  text, text, integer, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
);
drop function private.cleanup_ai_studio_retention_batch(integer);
drop function private.count_ai_studio_retention();
drop function private.ai_studio_metadata_cutoff(integer, timestamptz);
commit;
