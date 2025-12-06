-- Fix task_history foreign key to reference public.users instead of auth.users
-- and add RPC function for efficient data retrieval

-- Step 1: Drop the existing foreign key constraint on changed_by
ALTER TABLE public.task_history
DROP CONSTRAINT IF EXISTS task_history_changed_by_fkey;

-- Step 2: Add new foreign key constraint to public.users
ALTER TABLE public.task_history
ADD CONSTRAINT task_history_changed_by_fkey
FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Step 3: Update RLS policy to include role-based access (not just workspace_members)
DROP POLICY IF EXISTS task_history_select_policy ON public.task_history;

CREATE POLICY task_history_select_policy ON public.task_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.tasks t
            JOIN public.task_lists tl ON t.list_id = tl.id
            JOIN public.workspace_boards wb ON tl.board_id = wb.id
            WHERE t.id = task_history.task_id
              AND t.deleted_at IS NULL
              AND (
                  -- Direct workspace membership
                  EXISTS (
                      SELECT 1 FROM public.workspace_members wm
                      WHERE wm.ws_id = wb.ws_id AND wm.user_id = auth.uid()
                  )
                  OR
                  -- Role-based access
                  EXISTS (
                      SELECT 1 FROM public.workspace_role_members wrm
                      JOIN public.workspace_roles wr ON wrm.role_id = wr.id
                      WHERE wr.ws_id = wb.ws_id AND wrm.user_id = auth.uid()
                  )
                  OR
                  -- Workspace creator
                  EXISTS (
                      SELECT 1 FROM public.workspaces w
                      WHERE w.id = wb.ws_id AND w.creator_id = auth.uid()
                  )
              )
        )
    );

-- Step 4: Create RPC function for efficient task history retrieval
CREATE OR REPLACE FUNCTION public.get_workspace_task_history(
    p_ws_id UUID,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20,
    p_change_type TEXT DEFAULT NULL,
    p_field_name TEXT DEFAULT NULL,
    p_board_id UUID DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    task_id UUID,
    task_name TEXT,
    board_id UUID,
    board_name TEXT,
    changed_by UUID,
    changed_at TIMESTAMPTZ,
    change_type TEXT,
    field_name TEXT,
    old_value JSONB,
    new_value JSONB,
    metadata JSONB,
    user_id UUID,
    user_display_name TEXT,
    user_avatar_url TEXT,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offset INT;
    v_has_access BOOLEAN;
BEGIN
    -- Calculate offset
    v_offset := (p_page - 1) * p_page_size;

    -- Check if user has access to the workspace
    SELECT EXISTS (
        -- Direct workspace membership
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
        UNION ALL
        -- Role-based access
        SELECT 1 FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr ON wrm.role_id = wr.id
        WHERE wr.ws_id = p_ws_id AND wrm.user_id = auth.uid()
        UNION ALL
        -- Workspace creator
        SELECT 1 FROM public.workspaces w
        WHERE w.id = p_ws_id AND w.creator_id = auth.uid()
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied to workspace';
    END IF;

    RETURN QUERY
    WITH workspace_tasks AS (
        -- Get all tasks in the workspace with their board info
        SELECT
            t.id AS task_id,
            t.name AS task_name,
            wb.id AS board_id,
            wb.name AS board_name
        FROM public.tasks t
        JOIN public.task_lists tl ON t.list_id = tl.id
        JOIN public.workspace_boards wb ON tl.board_id = wb.id
        WHERE wb.ws_id = p_ws_id
          AND t.deleted_at IS NULL
          AND (p_board_id IS NULL OR wb.id = p_board_id)
          AND (p_search IS NULL OR t.name ILIKE '%' || p_search || '%')
    ),
    filtered_history AS (
        -- Get task history with filters
        SELECT
            th.id,
            th.task_id,
            wt.task_name,
            wt.board_id,
            wt.board_name,
            th.changed_by,
            th.changed_at,
            th.change_type,
            th.field_name,
            th.old_value,
            th.new_value,
            th.metadata,
            COUNT(*) OVER() AS total_count
        FROM public.task_history th
        JOIN workspace_tasks wt ON th.task_id = wt.task_id
        WHERE th.deleted_at IS NULL
          AND (p_change_type IS NULL OR th.change_type = p_change_type)
          AND (p_field_name IS NULL OR th.field_name = p_field_name)
          AND (p_from IS NULL OR th.changed_at >= p_from)
          AND (p_to IS NULL OR th.changed_at <= p_to)
        ORDER BY th.changed_at DESC, th.id DESC
        LIMIT p_page_size
        OFFSET v_offset
    )
    SELECT
        fh.id,
        fh.task_id,
        fh.task_name,
        fh.board_id,
        fh.board_name,
        fh.changed_by,
        fh.changed_at,
        fh.change_type,
        fh.field_name,
        fh.old_value,
        fh.new_value,
        fh.metadata,
        u.id AS user_id,
        u.display_name AS user_display_name,
        u.avatar_url AS user_avatar_url,
        fh.total_count
    FROM filtered_history fh
    LEFT JOIN public.users u ON fh.changed_by = u.id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_workspace_task_history TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_workspace_task_history IS 'Efficiently retrieves task history for a workspace with pagination, filtering, and user info. Access is verified via membership, roles, or creator status.';

-- Step 5: Create RPC function for single task history retrieval
CREATE OR REPLACE FUNCTION public.get_task_history(
    p_ws_id UUID,
    p_task_id UUID,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0,
    p_change_type TEXT DEFAULT NULL,
    p_field_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    task_id UUID,
    task_name TEXT,
    changed_by UUID,
    changed_at TIMESTAMPTZ,
    change_type TEXT,
    field_name TEXT,
    old_value JSONB,
    new_value JSONB,
    metadata JSONB,
    user_id UUID,
    user_display_name TEXT,
    user_avatar_url TEXT,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_access BOOLEAN;
    v_task_ws_id UUID;
BEGIN
    -- Get the workspace ID for the task and verify it matches
    SELECT wb.ws_id INTO v_task_ws_id
    FROM public.tasks t
    JOIN public.task_lists tl ON t.list_id = tl.id
    JOIN public.workspace_boards wb ON tl.board_id = wb.id
    WHERE t.id = p_task_id AND t.deleted_at IS NULL;

    IF v_task_ws_id IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task_ws_id != p_ws_id THEN
        RAISE EXCEPTION 'Task does not belong to this workspace';
    END IF;

    -- Check if user has access to the workspace
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
        UNION ALL
        SELECT 1 FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr ON wrm.role_id = wr.id
        WHERE wr.ws_id = p_ws_id AND wrm.user_id = auth.uid()
        UNION ALL
        SELECT 1 FROM public.workspaces w
        WHERE w.id = p_ws_id AND w.creator_id = auth.uid()
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied to workspace';
    END IF;

    RETURN QUERY
    WITH task_info AS (
        SELECT t.name AS task_name
        FROM public.tasks t
        WHERE t.id = p_task_id
    ),
    filtered_history AS (
        SELECT
            th.id,
            th.task_id,
            ti.task_name,
            th.changed_by,
            th.changed_at,
            th.change_type,
            th.field_name,
            th.old_value,
            th.new_value,
            th.metadata,
            COUNT(*) OVER() AS total_count
        FROM public.task_history th
        CROSS JOIN task_info ti
        WHERE th.task_id = p_task_id
          AND th.deleted_at IS NULL
          AND (p_change_type IS NULL OR th.change_type = p_change_type)
          AND (p_field_name IS NULL OR th.field_name = p_field_name)
        ORDER BY th.changed_at DESC, th.id DESC
        LIMIT p_limit
        OFFSET p_offset
    )
    SELECT
        fh.id,
        fh.task_id,
        fh.task_name,
        fh.changed_by,
        fh.changed_at,
        fh.change_type,
        fh.field_name,
        fh.old_value,
        fh.new_value,
        fh.metadata,
        u.id AS user_id,
        u.display_name AS user_display_name,
        u.avatar_url AS user_avatar_url,
        fh.total_count
    FROM filtered_history fh
    LEFT JOIN public.users u ON fh.changed_by = u.id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_task_history TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_task_history IS 'Retrieves history for a specific task with pagination and filtering. Verifies workspace access via membership, roles, or creator status.';
