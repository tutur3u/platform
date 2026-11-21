-- Task progress metrics, goals and leaderboards are readable by every task
-- progress workspace member, but only the row's creator or owner can change
-- or remove it through direct client access. The Tasks API writes these
-- tables with the service role and applies its own workspace checks.
SET LOCAL lock_timeout = '3s';

DROP POLICY "task_progress_metrics_member_write" ON public.task_progress_metrics;

CREATE POLICY "task_progress_metrics_creator_insert"
  ON public.task_progress_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "task_progress_metrics_creator_update"
  ON public.task_progress_metrics
  FOR UPDATE
  TO authenticated
  USING (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "task_progress_metrics_creator_delete"
  ON public.task_progress_metrics
  FOR DELETE
  TO authenticated
  USING (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY "task_progress_goals_member_write" ON public.task_progress_goals;

CREATE POLICY "task_progress_goals_owner_insert"
  ON public.task_progress_goals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_task_progress_workspace_member(ws_id)
    AND owner_id = (SELECT auth.uid())
  );

CREATE POLICY "task_progress_goals_owner_update"
  ON public.task_progress_goals
  FOR UPDATE
  TO authenticated
  USING (
    public.is_task_progress_workspace_member(ws_id)
    AND owner_id = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_task_progress_workspace_member(ws_id)
    AND owner_id = (SELECT auth.uid())
  );

CREATE POLICY "task_progress_goals_owner_delete"
  ON public.task_progress_goals
  FOR DELETE
  TO authenticated
  USING (
    public.is_task_progress_workspace_member(ws_id)
    AND owner_id = (SELECT auth.uid())
  );

DROP POLICY "task_leaderboards_member_write" ON public.task_leaderboards;

CREATE POLICY "task_leaderboards_creator_insert"
  ON public.task_leaderboards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "task_leaderboards_creator_update"
  ON public.task_leaderboards
  FOR UPDATE
  TO authenticated
  USING (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "task_leaderboards_creator_delete"
  ON public.task_leaderboards
  FOR DELETE
  TO authenticated
  USING (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  );

-- Workspace members can write task templates directly under RLS, so the
-- database enforces the Tasks API limits: 120 characters for the slug, 1,024
-- for the template and task names, and 10,000 for the description. The
-- generic strict-text trigger would apply lower limits and reject values the
-- API accepts. NOT VALID enforces every new write without rescanning
-- historical rows.
ALTER TABLE public.task_templates
  ADD CONSTRAINT slug_strict_length_check
    CHECK (char_length(slug) <= 120) NOT VALID,
  ADD CONSTRAINT slug_strict_bytes_check
    CHECK (octet_length(slug) <= 480) NOT VALID,
  ADD CONSTRAINT name_strict_length_check
    CHECK (char_length(name) <= 1024) NOT VALID,
  ADD CONSTRAINT name_strict_bytes_check
    CHECK (octet_length(name) <= 4096) NOT VALID,
  ADD CONSTRAINT task_name_strict_length_check
    CHECK (char_length(task_name) <= 1024) NOT VALID,
  ADD CONSTRAINT task_name_strict_bytes_check
    CHECK (octet_length(task_name) <= 4096) NOT VALID,
  ADD CONSTRAINT description_strict_length_check
    CHECK (char_length(description) <= 10000) NOT VALID,
  ADD CONSTRAINT description_strict_bytes_check
    CHECK (octet_length(description) <= 40000) NOT VALID;
