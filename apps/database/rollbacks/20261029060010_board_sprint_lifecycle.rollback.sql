-- Manual rollback only: drops the end-sprint and move-tasks RPCs and the
-- trigger that keeps tasks in their board's current sprint. Run the
-- 20261029060020 rollback first, and deploy app code that no longer calls
-- end_board_sprint or move_tasks_to_board_sprint before running. Sprint
-- reports and memberships already written stay until the 20261029060000
-- rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP TRIGGER IF EXISTS sync_task_board_sprint_membership ON public.tasks;
DROP FUNCTION private.sync_task_board_sprint_membership();
DROP FUNCTION public.end_board_sprint(UUID, UUID, JSONB, TEXT);
DROP FUNCTION public.move_tasks_to_board_sprint(UUID, UUID[], UUID);

COMMIT;
