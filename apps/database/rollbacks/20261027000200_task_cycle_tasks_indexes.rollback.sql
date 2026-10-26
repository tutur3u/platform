-- Rollback for 20261027000200, 20261027000300 and 20261027000400.
-- Drops the one-cycle-per-task unique index and the cycle_id lookup index.
-- The 20261027000400 guard has no objects to remove. No rows are changed.
-- Run each statement on its own, outside a transaction (psql autocommit):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261027000200_task_cycle_tasks_indexes.rollback.sql
-- Deploy app code that does not upsert on task_id before applying this.
-- Not a migration: apply manually only with release-authority approval.
set lock_timeout = '5s';
drop index concurrently if exists public.idx_task_cycle_tasks_task_id_unique;
drop index concurrently if exists public.idx_task_cycle_tasks_cycle_id;
reset lock_timeout;
