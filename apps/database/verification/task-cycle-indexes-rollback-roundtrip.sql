-- Rollback proof for 20261101130010/130020 (task cycle cycle_id index).
-- Run ONLY against a disposable local stack, after applying
-- apps/database/rollbacks/20261101130010_index_task_cycle_tasks_cycle_id.rollback.sql,
-- then re-apply the two forward migrations and re-run
-- supabase/tests/task-cycle-one-per-task.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(1);

select ok(
  to_regclass('public.idx_task_cycle_tasks_cycle_id') is null,
  'rollback removes the cycle_id lookup index');

select * from finish();
rollback;
