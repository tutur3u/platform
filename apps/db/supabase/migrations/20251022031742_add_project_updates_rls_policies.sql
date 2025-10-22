-- Add RLS policies for project updates tables
-- These policies ensure users can only access updates for projects in their workspaces

-- ============================================================================
-- RLS Policies for task_project_updates
-- ============================================================================

-- Users can view updates for projects in their workspaces
CREATE POLICY "Users can view project updates in their workspaces"
  ON "public"."task_project_updates"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."task_projects" tp
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tp.id = task_project_updates.project_id
        AND wm.user_id = auth.uid()
        AND task_project_updates.deleted_at IS NULL
    )
  );

-- Users can create updates for projects in their workspaces
CREATE POLICY "Users can create project updates in their workspaces"
  ON "public"."task_project_updates"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "public"."task_projects" tp
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tp.id = task_project_updates.project_id
        AND wm.user_id = auth.uid()
    )
    AND creator_id = auth.uid()
  );

-- Users can update their own updates
CREATE POLICY "Users can update their own project updates"
  ON "public"."task_project_updates"
  FOR UPDATE
  USING (
    creator_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."task_projects" tp
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tp.id = task_project_updates.project_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    creator_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."task_projects" tp
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tp.id = task_project_updates.project_id
        AND wm.user_id = auth.uid()
    )
  );

-- Users can delete their own updates (soft delete)
CREATE POLICY "Users can delete their own project updates"
  ON "public"."task_project_updates"
  FOR DELETE
  USING (
    creator_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."task_projects" tp
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tp.id = task_project_updates.project_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS Policies for task_project_update_reactions
-- ============================================================================

-- Users can view reactions on updates they can see
CREATE POLICY "Users can view reactions on project updates"
  ON "public"."task_project_update_reactions"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_reactions.update_id
        AND wm.user_id = auth.uid()
        AND tpu.deleted_at IS NULL
    )
  );

-- Users can add reactions to updates in their workspaces
CREATE POLICY "Users can add reactions to project updates"
  ON "public"."task_project_update_reactions"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_reactions.update_id
        AND wm.user_id = auth.uid()
        AND tpu.deleted_at IS NULL
    )
    AND user_id = auth.uid()
  );

-- Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions"
  ON "public"."task_project_update_reactions"
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_reactions.update_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS Policies for task_project_update_comments
-- ============================================================================

-- Users can view comments on updates they can see
CREATE POLICY "Users can view comments on project updates"
  ON "public"."task_project_update_comments"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_comments.update_id
        AND wm.user_id = auth.uid()
        AND tpu.deleted_at IS NULL
        AND task_project_update_comments.deleted_at IS NULL
    )
  );

-- Users can create comments on updates in their workspaces
CREATE POLICY "Users can create comments on project updates"
  ON "public"."task_project_update_comments"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_comments.update_id
        AND wm.user_id = auth.uid()
        AND tpu.deleted_at IS NULL
    )
    AND user_id = auth.uid()
  );

-- Users can update their own comments
CREATE POLICY "Users can update their own comments"
  ON "public"."task_project_update_comments"
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_comments.update_id
        AND wm.user_id = auth.uid()
        AND tpu.deleted_at IS NULL
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_comments.update_id
        AND wm.user_id = auth.uid()
        AND tpu.deleted_at IS NULL
    )
  );

-- Users can delete their own comments (soft delete)
CREATE POLICY "Users can delete their own comments"
  ON "public"."task_project_update_comments"
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_comments.update_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS Policies for task_project_update_attachments
-- ============================================================================

-- Users can view attachments on updates they can see
CREATE POLICY "Users can view attachments on project updates"
  ON "public"."task_project_update_attachments"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_attachments.update_id
        AND wm.user_id = auth.uid()
        AND tpu.deleted_at IS NULL
    )
  );

-- Users can add attachments to updates in their workspaces
CREATE POLICY "Users can add attachments to project updates"
  ON "public"."task_project_update_attachments"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_attachments.update_id
        AND wm.user_id = auth.uid()
        AND tpu.deleted_at IS NULL
    )
    AND uploaded_by = auth.uid()
  );

-- Users can delete their own attachments
CREATE POLICY "Users can delete their own attachments"
  ON "public"."task_project_update_attachments"
  FOR DELETE
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."task_project_updates" tpu
      INNER JOIN "public"."task_projects" tp
        ON tp.id = tpu.project_id
      INNER JOIN "public"."workspace_members" wm
        ON wm.ws_id = tp.ws_id
      WHERE tpu.id = task_project_update_attachments.update_id
        AND wm.user_id = auth.uid()
    )
  );
