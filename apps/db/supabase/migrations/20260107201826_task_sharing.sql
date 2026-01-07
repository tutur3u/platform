-- Task Sharing Feature
-- Enables sharing tasks with users outside of a workspace via shareable links
-- with view-only or edit permissions (similar to Google Docs)

-- ============================================================================
-- ENUM: task_share_permission
-- Permission levels for task shares (extensible for 'comment' later)
-- ============================================================================
CREATE TYPE "public"."task_share_permission" AS ENUM ('view', 'edit');

-- ============================================================================
-- TABLE: task_shares
-- User-specific task shares (share with specific users by user_id or email)
-- ============================================================================
CREATE TABLE "public"."task_shares" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL,
  "shared_with_user_id" uuid,           -- User ID if user exists
  "shared_with_email" text,             -- Email for pending invites before user joins
  "permission" task_share_permission NOT NULL DEFAULT 'view',
  "shared_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "task_shares_task_id_fkey" 
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT "task_shares_shared_with_user_id_fkey" 
    FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT "task_shares_shared_by_user_id_fkey" 
    FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT "task_shares_user_unique" 
    UNIQUE ("task_id", "shared_with_user_id"),
  CONSTRAINT "task_shares_has_recipient" 
    CHECK (shared_with_user_id IS NOT NULL OR shared_with_email IS NOT NULL)
);

CREATE UNIQUE INDEX task_shares_email_unique_idx ON public.task_shares (task_id, LOWER(shared_with_email)) WHERE shared_with_email IS NOT NULL;

-- ============================================================================
-- TABLE: task_share_links
-- Link-based task shares (anyone with the link who is authenticated)
-- ============================================================================
CREATE TABLE "public"."task_share_links" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL,
  "code" text NOT NULL,                 -- Random alphanumeric code for URL
  "permission" task_share_permission NOT NULL DEFAULT 'view',
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  -- Future extensibility fields (commented for reference):
  -- "require_auth" boolean DEFAULT true,
  -- "expires_at" timestamptz,
  -- "max_uses" integer,
  -- "password_hash" text,  -- Can reuse bcrypt pattern from link_shortener
  PRIMARY KEY ("id"),
  CONSTRAINT "task_share_links_task_id_fkey" 
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT "task_share_links_created_by_user_id_fkey" 
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT "task_share_links_code_unique" UNIQUE ("code")
);

-- ============================================================================
-- TABLE: task_share_link_uses
-- Track link usage for analytics
-- ============================================================================
CREATE TABLE "public"."task_share_link_uses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "share_link_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "accessed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "task_share_link_uses_share_link_id_fkey" 
    FOREIGN KEY (share_link_id) REFERENCES task_share_links(id) ON DELETE CASCADE,
  CONSTRAINT "task_share_link_uses_user_id_fkey" 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX task_shares_task_id_idx ON task_shares(task_id);
CREATE INDEX task_shares_shared_with_user_id_idx ON task_shares(shared_with_user_id);
CREATE INDEX task_shares_shared_with_email_idx ON task_shares(shared_with_email) WHERE shared_with_email IS NOT NULL;
CREATE INDEX task_share_links_task_id_idx ON task_share_links(task_id);
CREATE INDEX task_share_link_uses_share_link_id_idx ON task_share_link_uses(share_link_id);

-- ============================================================================
-- ENABLE RLS
-- ============================================================================
ALTER TABLE task_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_share_link_uses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: get_task_workspace_id
-- Returns the workspace ID for a given task
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_task_workspace_id(p_task_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT wb.ws_id
  FROM tasks t
  JOIN task_lists tl ON tl.id = t.list_id
  JOIN workspace_boards wb ON wb.id = tl.board_id
  WHERE t.id = p_task_id;
$$;

-- ============================================================================
-- HELPER FUNCTION: is_task_workspace_member
-- Checks if the current user is a member of the task's workspace
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_task_workspace_member(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tasks t
    JOIN task_lists tl ON tl.id = t.list_id
    JOIN workspace_boards wb ON wb.id = tl.board_id
    JOIN workspace_members wm ON wm.ws_id = wb.ws_id
    WHERE t.id = p_task_id AND wm.user_id = auth.uid()
  );
$$;

-- ============================================================================
-- HELPER FUNCTION: is_task_sharing_enabled
-- Checks if task sharing is enabled for the task's workspace
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_task_sharing_enabled(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM workspace_secrets ws
    WHERE ws.ws_id = get_task_workspace_id(p_task_id)
    AND ws.name = 'DISABLE_TASK_SHARING'
  );
$$;

-- ============================================================================
-- RLS POLICIES: task_shares
-- ============================================================================

-- SELECT: Workspace members can view all shares for tasks in their workspace
CREATE POLICY "Allow workspace members to view task shares"
ON "public"."task_shares"
FOR SELECT
TO authenticated
USING (is_task_workspace_member(task_id));

-- SELECT: Users can see shares where they are the recipient
CREATE POLICY "Allow recipients to view their own shares"
ON "public"."task_shares"
FOR SELECT
TO authenticated
USING (
  shared_with_user_id = auth.uid()
  OR shared_with_email = (SELECT email FROM user_private_details WHERE user_id = auth.uid())
);

-- INSERT: Workspace members can create shares if sharing is enabled
CREATE POLICY "Allow workspace members to create task shares"
ON "public"."task_shares"
FOR INSERT
TO authenticated
WITH CHECK (
  is_task_workspace_member(task_id)
  AND is_task_sharing_enabled(task_id)
  AND shared_by_user_id = auth.uid()
);

-- UPDATE: Workspace members can update shares
CREATE POLICY "Allow workspace members to update task shares"
ON "public"."task_shares"
FOR UPDATE
TO authenticated
USING (is_task_workspace_member(task_id))
WITH CHECK (is_task_workspace_member(task_id));

-- DELETE: Workspace members can delete shares
CREATE POLICY "Allow workspace members to delete task shares"
ON "public"."task_shares"
FOR DELETE
TO authenticated
USING (is_task_workspace_member(task_id));

-- ============================================================================
-- RLS POLICIES: task_share_links
-- ============================================================================

-- SELECT: Workspace members can view share links for tasks in their workspace
CREATE POLICY "Allow workspace members to view task share links"
ON "public"."task_share_links"
FOR SELECT
TO authenticated
USING (is_task_workspace_member(task_id));

-- SELECT: Workspace members can view share links for tasks in their workspace
-- Note: External access via code lookup should be handled via secure functions or specific policies that don't allow enumeration
CREATE POLICY "Allow authenticated users to lookup share links by code"
ON "public"."task_share_links"
FOR SELECT
TO authenticated
USING (is_task_workspace_member(task_id));  -- Restricted to members to prevent enumeration

-- INSERT: Workspace members can create share links if sharing is enabled
CREATE POLICY "Allow workspace members to create task share links"
ON "public"."task_share_links"
FOR INSERT
TO authenticated
WITH CHECK (
  is_task_workspace_member(task_id)
  AND is_task_sharing_enabled(task_id)
  AND created_by_user_id = auth.uid()
);

-- UPDATE: Workspace members can update share links
CREATE POLICY "Allow workspace members to update task share links"
ON "public"."task_share_links"
FOR UPDATE
TO authenticated
USING (is_task_workspace_member(task_id))
WITH CHECK (is_task_workspace_member(task_id));

-- DELETE: Workspace members can delete share links
CREATE POLICY "Allow workspace members to delete task share links"
ON "public"."task_share_links"
FOR DELETE
TO authenticated
USING (is_task_workspace_member(task_id));

-- ============================================================================
-- RLS POLICIES: task_share_link_uses
-- ============================================================================

-- SELECT: Workspace members can view usage for their workspace's share links
CREATE POLICY "Allow workspace members to view share link uses"
ON "public"."task_share_link_uses"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM task_share_links tsl
    WHERE tsl.id = share_link_id
    AND is_task_workspace_member(tsl.task_id)
  )
);

-- INSERT: Authenticated users can record their own usage
CREATE POLICY "Allow users to record their share link usage"
ON "public"."task_share_link_uses"
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- FUNCTION: is_task_accessible (UPDATED)
-- Now includes shared access check
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_task_accessible(_task_id uuid)
RETURNS boolean
STABLE
LANGUAGE sql
SECURITY DEFINER
AS $$
SELECT EXISTS (SELECT 1 FROM tasks WHERE id = _task_id)
AND (
  -- User is workspace member
  EXISTS (
    SELECT 1
    FROM tasks t
    JOIN task_lists tl ON tl.id = t.list_id
    JOIN workspace_boards wb ON wb.id = tl.board_id
    JOIN workspace_members wm ON wm.ws_id = wb.ws_id
    WHERE t.id = _task_id AND wm.user_id = auth.uid()
  )
  OR
  -- User has a direct share by user_id
  EXISTS (
    SELECT 1 FROM task_shares ts
    WHERE ts.task_id = _task_id AND ts.shared_with_user_id = auth.uid()
  )
  OR
  -- User has a pending email share (matches their email)
  EXISTS (
    SELECT 1 FROM task_shares ts
    JOIN user_private_details upd ON upd.user_id = auth.uid()
    WHERE ts.task_id = _task_id AND LOWER(ts.shared_with_email) = LOWER(upd.email)
  )
  OR
  -- Link-based access (if link exists)
  EXISTS (
    SELECT 1 FROM task_share_links tsl
    WHERE tsl.task_id = _task_id
  )
);
$$;

-- ============================================================================
-- FUNCTION: has_task_permission
-- Checks if user has specific permission on a task
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_task_permission(
  p_task_id uuid,
  p_permission text  -- 'view' or 'edit'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Workspace members have full access
  IF EXISTS (
    SELECT 1
    FROM tasks t
    JOIN task_lists tl ON tl.id = t.list_id
    JOIN workspace_boards wb ON wb.id = tl.board_id
    JOIN workspace_members wm ON wm.ws_id = wb.ws_id
    WHERE t.id = p_task_id AND wm.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  -- Check direct share permission by user_id
  IF p_permission = 'view' THEN
    RETURN EXISTS (
      SELECT 1 FROM task_shares ts
      WHERE ts.task_id = p_task_id 
      AND (
        ts.shared_with_user_id = auth.uid()
        OR LOWER(ts.shared_with_email) = LOWER((SELECT email FROM user_private_details WHERE user_id = auth.uid()))
      )
    );
  ELSIF p_permission = 'edit' THEN
    RETURN EXISTS (
      SELECT 1 FROM task_shares ts
      WHERE ts.task_id = p_task_id 
      AND (
        ts.shared_with_user_id = auth.uid()
        OR LOWER(ts.shared_with_email) = LOWER((SELECT email FROM user_private_details WHERE user_id = auth.uid()))
      )
      AND ts.permission = 'edit'
    );
  END IF;

  RETURN false;
END;
$$;

-- ============================================================================
-- FUNCTION: get_task_share_permission_from_link
-- Gets permission level for a user accessing via share link
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_task_share_permission_from_link(
  p_share_code text
)
RETURNS task_share_permission
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT permission FROM task_share_links WHERE code = p_share_code;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON task_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_share_links TO authenticated;
GRANT SELECT, INSERT ON task_share_link_uses TO authenticated;

GRANT ALL ON task_shares TO service_role;
GRANT ALL ON task_share_links TO service_role;
GRANT ALL ON task_share_link_uses TO service_role;

GRANT EXECUTE ON FUNCTION get_task_workspace_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_task_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_task_sharing_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_task_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_task_share_permission_from_link(text) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE task_shares IS 'User-specific task shares for sharing tasks with specific users';
COMMENT ON TABLE task_share_links IS 'Link-based task shares for sharing via shareable links';
COMMENT ON TABLE task_share_link_uses IS 'Tracks usage of task share links for analytics';

COMMENT ON FUNCTION has_task_permission(uuid, text) IS 
  'Checks if the current user has a specific permission (view/edit) on a task. Returns true for workspace members or users with matching share permissions.';

COMMENT ON FUNCTION is_task_sharing_enabled(uuid) IS 
  'Checks if task sharing is enabled for a task''s workspace. Disabled via DISABLE_TASK_SHARING secret.';
