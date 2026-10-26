-- Rollback proof for 20261027000100_guard_task_cycle_task_workspace.sql.
-- Run ONLY against a disposable local stack, after applying
-- apps/database/rollbacks/20261027000100_guard_task_cycle_task_workspace.rollback.sql:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261027000100_guard_task_cycle_task_workspace.rollback.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/verification/task-cycle-workspace-guard-rollback-roundtrip.sql
-- then re-apply the forward migration and re-run
-- supabase/tests/task-cycle-workspace-guard.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

select hasnt_trigger('public', 'task_cycle_tasks',
  'enforce_task_cycle_task_workspace',
  'rollback removes the same-workspace guard trigger');
select hasnt_trigger('public', 'task_cycles',
  'prevent_task_cycle_workspace_change',
  'rollback removes the cycle workspace immutability trigger');
select ok(
  to_regprocedure('public.enforce_task_cycle_task_workspace()') is null
    and to_regprocedure('public.prevent_task_cycle_workspace_change()') is null,
  'rollback removes both guard functions');

insert into auth.users (id) values ('00000000-0000-4000-8000-00000000d903')
on conflict do nothing;
insert into public.users (id) values ('00000000-0000-4000-8000-00000000d903')
on conflict do nothing;
insert into public.workspaces (id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-00000000d101', 'Rollback A', '00000000-0000-4000-8000-00000000d903', false),
  ('00000000-0000-4000-8000-00000000d102', 'Rollback B', '00000000-0000-4000-8000-00000000d903', false);
insert into public.workspace_boards (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-00000000d202', '00000000-0000-4000-8000-00000000d102', 'B Board', '00000000-0000-4000-8000-00000000d903');
insert into public.task_lists (id, name, board_id, creator_id) values
  ('00000000-0000-4000-8000-00000000d302', 'B List', '00000000-0000-4000-8000-00000000d202', '00000000-0000-4000-8000-00000000d903');
insert into public.tasks (id, name, list_id, creator_id) values
  ('00000000-0000-4000-8000-00000000d403', 'B Task', '00000000-0000-4000-8000-00000000d302', '00000000-0000-4000-8000-00000000d903');
insert into public.task_cycles (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-00000000d501', '00000000-0000-4000-8000-00000000d101', 'A Cycle', '00000000-0000-4000-8000-00000000d903');

set local role service_role;
select lives_ok(
  $$insert into public.task_cycle_tasks (task_id, cycle_id)
    values ('00000000-0000-4000-8000-00000000d403', '00000000-0000-4000-8000-00000000d501')$$,
  'rollback restores the pre-guard behavior (cross-workspace link accepted)');

select * from finish();
rollback;
