-- MANUAL ONLY: #6460 reverse step 3, after 145300/145200, before #6457/145000.
-- Restores the pre-index catalog; no table rows are changed or lost.
-- Reaper queries may become slower if its callers were not stopped first.
-- Run this file alone with autocommit (psql -X -v ON_ERROR_STOP=1 -f FILE).
-- NEVER use BEGIN, psql -1/--single-transaction, a surrounding transaction,
-- or a runner that batches the file into one transaction. Cancel/retry on timeout;
-- long transactions can delay a concurrent drop. Verify the exact index before retry.
-- SET values are session scoped; on error close this session or RESET both settings.
set lock_timeout = '5s';
set statement_timeout = '5min';
drop index concurrently if exists private.idx_devbox_runs_active_updated;
reset statement_timeout;
reset lock_timeout;
