-- Rollback for 20261101130000, 20261101130010 and 20261101130020.
-- Drops the one-cycle-per-task unique index and the cycle_id lookup index.
-- The 20261101130020 guard has no objects to remove. No rows are changed.
-- Run each statement on its own, outside a transaction (psql autocommit):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261101130000_index_task_cycle_tasks_one_cycle_per_task.rollback.sql
-- Deploy app code that does not upsert on task_id before applying this.
-- Not a migration: apply manually only with release-authority approval.
set lock_timeout = '5s';
drop index concurrently if exists public.idx_task_cycle_tasks_task_id_unique;
drop index concurrently if exists public.idx_task_cycle_tasks_cycle_id;
reset lock_timeout;
