-- Rollback for 20261104152700_assign_task_cycle.sql.
-- Drops public.assign_task_cycle(uuid, uuid). No rows are changed.
-- Deploy Tasks API code that does not call the assign_task_cycle rpc first,
-- or every assign to a cycle fails.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261104152700_assign_task_cycle.rollback.sql
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
drop function if exists public.assign_task_cycle(uuid, uuid);
commit;
