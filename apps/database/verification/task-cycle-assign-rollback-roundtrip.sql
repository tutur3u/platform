-- Rollback proof for 20261101130030_assign_task_cycle.sql.
-- Run ONLY against a disposable local stack, after applying
-- apps/database/rollbacks/20261101130030_assign_task_cycle.rollback.sql,
-- then re-apply the forward migration and re-run
-- supabase/tests/task-cycle-one-per-task.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(1);

select hasnt_function(
  'public',
  'assign_task_cycle',
  array['uuid', 'uuid'],
  'rollback removes assign_task_cycle(uuid, uuid)');

select * from finish();
rollback;
