-- MANUAL ONLY: #6460 reverse step 2, after 145300 and before 145100.
-- The forward migration is a catalog assertion with no persistent objects or DML.
-- There is nothing to restore and no data loss. Keep its ledger entry unchanged.
-- Run as a separate file; the next CONCURRENTLY rollback MUST NOT share a transaction.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin null; end $$;
commit;
