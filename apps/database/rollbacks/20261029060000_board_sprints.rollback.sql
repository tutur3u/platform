-- Manual rollback only: removes board sprints. Drops the sprint RPCs and
-- helpers, the sprint report table, the sprint columns on task_cycles,
-- task_cycle_tasks and workspace_boards, and restores main's task cycle
-- policies (20250929060000_add_task_cycles.sql, with the task cycle task
-- policy as 20260701070408_wrap_rls_perf_initplan.sql left it). Run the
-- 20261029060010 rollback first, and deploy app code without board sprints.
-- Refuses while any board still uses sprints, has a sprint or has a sprint
-- report: turn sprints off and delete those rows first, since this drops them.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workspace_boards WHERE sprint_length_weeks IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'boards still use sprints; turn sprints off first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.task_cycles WHERE board_id IS NOT NULL) THEN
    RAISE EXCEPTION 'board sprints exist; delete them first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.task_sprint_reports) THEN
    RAISE EXCEPTION 'sprint reports exist; delete them first';
  END IF;
END;
$guard$;

-- 1. RPCs and helpers.
DROP FUNCTION public.set_board_sprint_length(UUID, SMALLINT, UUID);
DROP FUNCTION public.start_board_sprint(UUID, UUID);
DROP FUNCTION private.create_planned_board_sprint(UUID, DATE, UUID);
DROP FUNCTION private.board_sprint_end_date(DATE, INTEGER);
DROP FUNCTION private.board_sprint_next_monday(DATE);

-- 2. Main's task cycle policies.
DROP POLICY IF EXISTS "Users can view task cycles in their workspaces" ON public.task_cycles;
DROP POLICY IF EXISTS "Users can create task cycles in their workspaces" ON public.task_cycles;
DROP POLICY IF EXISTS "Users can update task cycles in their workspaces" ON public.task_cycles;
DROP POLICY IF EXISTS "Users can delete task cycles in their workspaces" ON public.task_cycles;

CREATE POLICY "Users can view task cycles in their workspaces" ON "public"."task_cycles"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = task_cycles.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create task cycles in their workspaces" ON "public"."task_cycles"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = task_cycles.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update task cycles in their workspaces" ON "public"."task_cycles"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = task_cycles.ws_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete task cycles in their workspaces" ON "public"."task_cycles"
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = task_cycles.ws_id AND wm.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage task cycle tasks in their workspaces" ON public.task_cycle_tasks;

CREATE POLICY "Users can manage task cycle tasks in their workspaces" ON public.task_cycle_tasks
    FOR ALL USING ((EXISTS ( SELECT 1 FROM (public.task_cycles tc JOIN public.workspace_members wm ON ((wm.ws_id = tc.ws_id))) WHERE ((tc.id = task_cycle_tasks.cycle_id) AND (wm.user_id = (select auth.uid()))))));

-- 3. Sprint reports.
DROP TABLE public.task_sprint_reports;

-- 4. Membership metadata.
DROP INDEX IF EXISTS public.task_cycle_tasks_cycle_id_idx;
ALTER TABLE public.task_cycle_tasks
  DROP COLUMN end_decision,
  DROP COLUMN carry_count,
  DROP COLUMN added_after_start;

-- 5. Sprint columns on cycles and boards.
DROP INDEX IF EXISTS public.task_cycles_one_planned_per_board;
DROP INDEX public.task_cycles_one_active_per_board;
DROP INDEX public.task_cycles_board_sequence_key;
ALTER TABLE public.task_cycles
  DROP CONSTRAINT task_cycles_board_sequence_check,
  DROP CONSTRAINT task_cycles_goal_result_check,
  DROP CONSTRAINT task_cycles_goal_length_check,
  DROP COLUMN ended_at,
  DROP COLUMN started_at,
  DROP COLUMN goal_result,
  DROP COLUMN goal,
  DROP COLUMN sequence_number,
  DROP COLUMN board_id;

ALTER TABLE public.workspace_boards DROP COLUMN sprint_length_weeks;

COMMIT;
