-- Rollback for 20261101130010 and 20261101130020.
-- Drops the cycle_id lookup index. The 20261101130020 guard has no objects to
-- remove. No rows are changed. Run outside a transaction (psql autocommit):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261101130010_index_task_cycle_tasks_cycle_id.rollback.sql
-- Not a migration: apply manually only with release-authority approval.
set lock_timeout = '5s';
drop index concurrently if exists public.idx_task_cycle_tasks_cycle_id;
reset lock_timeout;
