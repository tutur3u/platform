-- Rollback proof for 20261027000200/000300/000400 (task cycle indexes).
-- Run ONLY against a disposable local stack, after applying
-- apps/database/rollbacks/20261027000200_task_cycle_tasks_indexes.rollback.sql,
-- then re-apply the three forward migrations and re-run
-- supabase/tests/task-cycle-one-per-task.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(2);

select ok(
  to_regclass('public.idx_task_cycle_tasks_task_id_unique') is null,
  'rollback removes the one-cycle-per-task unique index');
select ok(
  to_regclass('public.idx_task_cycle_tasks_cycle_id') is null,
  'rollback removes the cycle_id lookup index');

select * from finish();
rollback;
