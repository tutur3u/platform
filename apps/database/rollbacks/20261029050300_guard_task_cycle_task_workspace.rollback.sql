-- Rollback for 20261029025200_guard_task_cycle_task_workspace.sql.
-- Removes the same-workspace link guard and the cycle ws_id immutability guard.
-- WARNING: this reopens cross-workspace cycle links (security regression).
-- No rows are changed. Do not use CASCADE; this file does not change the
-- migration ledger.
-- Not a migration: apply manually only with release-authority approval.
-- Proof: apps/database/verification/task-cycle-workspace-guard-rollback-roundtrip.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop trigger if exists enforce_task_cycle_task_workspace
  on public.task_cycle_tasks;
drop trigger if exists prevent_task_cycle_workspace_change
  on public.task_cycles;

drop function if exists public.enforce_task_cycle_task_workspace();
drop function if exists public.prevent_task_cycle_workspace_change();

commit;
