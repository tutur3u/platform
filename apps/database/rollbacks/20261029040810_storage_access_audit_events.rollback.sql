-- Schema reversal deletes audit history. Prefer flag-off in production.
-- Disable STORAGE_ACCESS_AUDIT_ENABLED and the retention job first; archive
-- retained audit rows securely before an explicitly authorized schema reversal.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop function private.prune_storage_access_events(integer);
drop table private.storage_access_events;
commit;
