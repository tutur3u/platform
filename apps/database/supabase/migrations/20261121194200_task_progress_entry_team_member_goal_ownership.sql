-- Direct client access to task progress follows the product ownership rules.
-- Members read workspace progress; progress entries change only by their
-- creator; leaderboard teams are removed by their creator or the leaderboard
-- creator; leaderboard memberships are added and removed by the member or the
-- leaderboard creator; team and membership edits, XP, levels and achievement
-- unlocks are written by the Tasks service only; private goals are visible
-- only to their owner. The Tasks API writes these tables with the service
-- role and applies the same rules.
SET LOCAL lock_timeout = '3s';

-- Progress entries.
DROP POLICY "task_progress_entries_member_write" ON public.task_progress_entries;

CREATE POLICY "task_progress_entries_creator_insert"
  ON public.task_progress_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "task_progress_entries_creator_update"
  ON public.task_progress_entries
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

CREATE POLICY "task_progress_entries_creator_delete"
  ON public.task_progress_entries
  FOR DELETE
  TO authenticated
  USING (
    public.is_task_progress_workspace_member(ws_id)
    AND created_by = (SELECT auth.uid())
  );

-- Leaderboard teams: any member of the leaderboard's workspace may create a
-- team; the team's creator or the leaderboard's creator removes it. Renames
-- go through the Tasks API, so a client cannot hand a team to someone else.
DROP POLICY "task_leaderboard_teams_member_write" ON public.task_leaderboard_teams;

CREATE POLICY "task_leaderboard_teams_member_insert"
  ON public.task_leaderboard_teams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.task_leaderboards leaderboard
      WHERE leaderboard.id = task_leaderboard_teams.leaderboard_id
        AND public.is_task_progress_workspace_member(leaderboard.ws_id)
    )
  );

CREATE POLICY "task_leaderboard_teams_owner_delete"
  ON public.task_leaderboard_teams
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.task_leaderboards leaderboard
      WHERE leaderboard.id = task_leaderboard_teams.leaderboard_id
        AND public.is_task_progress_workspace_member(leaderboard.ws_id)
        AND (
          task_leaderboard_teams.created_by = (SELECT auth.uid())
          OR leaderboard.created_by = (SELECT auth.uid())
        )
    )
  );

-- Leaderboard memberships: members join and leave themselves; the
-- leaderboard's creator also adds and removes other workspace members.
-- Membership changes go through the Tasks API, so a client cannot rewrite
-- who a membership belongs to or who added it.
DROP POLICY "task_leaderboard_members_member_write" ON public.task_leaderboard_members;

CREATE POLICY "task_leaderboard_members_self_or_owner_insert"
  ON public.task_leaderboard_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    joined_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.task_leaderboards leaderboard
      WHERE leaderboard.id = task_leaderboard_members.leaderboard_id
        AND public.is_task_progress_workspace_member(leaderboard.ws_id)
        AND public.is_task_progress_workspace_member(
          leaderboard.ws_id,
          task_leaderboard_members.user_id
        )
        AND (
          task_leaderboard_members.user_id = (SELECT auth.uid())
          OR leaderboard.created_by = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY "task_leaderboard_members_self_or_owner_delete"
  ON public.task_leaderboard_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.task_leaderboards leaderboard
      WHERE leaderboard.id = task_leaderboard_members.leaderboard_id
        AND public.is_task_progress_workspace_member(leaderboard.ws_id)
        AND (
          task_leaderboard_members.user_id = (SELECT auth.uid())
          OR leaderboard.created_by = (SELECT auth.uid())
        )
    )
  );

-- Goals: workspace-visible goals for members, private goals for the owner.
DROP POLICY "task_progress_goals_member_select" ON public.task_progress_goals;

CREATE POLICY "task_progress_goals_visible_select"
  ON public.task_progress_goals
  FOR SELECT
  TO authenticated
  USING (
    public.is_task_progress_workspace_member(ws_id)
    AND (
      visibility = 'workspace'
      OR owner_id = (SELECT auth.uid())
    )
  );

REVOKE UPDATE ON TABLE public.task_leaderboard_teams FROM anon, authenticated;
REVOKE UPDATE ON TABLE public.task_leaderboard_members FROM anon, authenticated;

-- XP, levels and achievement unlocks are awarded by the Tasks service.
DROP POLICY "task_progress_user_achievements_owner_write"
  ON public.task_progress_user_achievements;
DROP POLICY "task_progress_user_stats_owner_write"
  ON public.task_progress_user_stats;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.task_progress_achievements
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.task_progress_user_achievements
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.task_progress_user_stats
  FROM anon, authenticated;
