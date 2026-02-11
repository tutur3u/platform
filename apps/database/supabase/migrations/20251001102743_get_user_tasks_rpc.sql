-- Create RPC function to get all tasks accessible by a user
-- This includes:
-- 1. Tasks assigned to the user (across all workspaces)
-- 2. Tasks in boards belonging to the user's personal workspace

CREATE OR REPLACE FUNCTION get_user_accessible_tasks(
  p_user_id UUID,
  p_ws_id UUID DEFAULT NULL,
  p_include_deleted BOOLEAN DEFAULT FALSE,
  p_list_statuses task_board_status[] DEFAULT ARRAY['not_started', 'active']::task_board_status[]
)
RETURNS TABLE (
  task_id UUID,
  task_name TEXT,
  task_description TEXT,
  task_creator_id UUID,
  task_list_id UUID,
  task_start_date TIMESTAMPTZ,
  task_end_date TIMESTAMPTZ,
  task_priority task_priority,
  task_completed BOOLEAN,
  task_archived BOOLEAN,
  task_deleted BOOLEAN,
  task_estimation_points SMALLINT,
  task_created_at TIMESTAMPTZ,
  task_calendar_hours calendar_hours,
  task_total_duration REAL,
  task_is_splittable BOOLEAN,
  task_min_split_duration_minutes REAL,
  task_max_split_duration_minutes REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_personal_ws_id UUID;
  v_is_personal BOOLEAN;
BEGIN
  -- Get user's personal workspace if not specified
  IF p_ws_id IS NULL THEN
    SELECT w.id INTO v_personal_ws_id
    FROM workspaces w
    INNER JOIN workspace_members wm ON wm.ws_id = w.id
    WHERE w.personal = TRUE
      AND wm.user_id = p_user_id
    LIMIT 1;
  ELSE
    v_personal_ws_id := p_ws_id;
  END IF;

  -- Check if the specified workspace is personal
  SELECT personal INTO v_is_personal
  FROM workspaces
  WHERE workspaces.id = v_personal_ws_id;

  -- If workspace is personal, return tasks assigned to user + tasks in personal workspace boards
  IF v_is_personal THEN
    RETURN QUERY
    SELECT DISTINCT
      t.id,
      t.name,
      t.description,
      t.creator_id,
      t.list_id,
      t.start_date,
      t.end_date,
      t.priority,
      t.completed,
      t.archived,
      t.deleted,
      t.estimation_points,
      t.created_at,
      t.calendar_hours,
      t.total_duration,
      t.is_splittable,
      t.min_split_duration_minutes,
      t.max_split_duration_minutes
    FROM tasks t
    INNER JOIN task_lists tl ON tl.id = t.list_id
    INNER JOIN workspace_boards wb ON wb.id = tl.board_id
    WHERE (
      -- Tasks assigned to the user (across all workspaces)
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id AND ta.user_id = p_user_id
      )
      -- OR tasks in personal workspace boards
      OR wb.ws_id = v_personal_ws_id
    )
    AND (p_include_deleted OR t.deleted = FALSE)
    AND (p_list_statuses IS NULL OR tl.status = ANY(p_list_statuses));
  ELSE
    -- If workspace is not personal, only return tasks from that workspace assigned to user
    RETURN QUERY
    SELECT DISTINCT
      t.id,
      t.name,
      t.description,
      t.creator_id,
      t.list_id,
      t.start_date,
      t.end_date,
      t.priority,
      t.completed,
      t.archived,
      t.deleted,
      t.estimation_points,
      t.created_at,
      t.calendar_hours,
      t.total_duration,
      t.is_splittable,
      t.min_split_duration_minutes,
      t.max_split_duration_minutes
    FROM tasks t
    INNER JOIN task_lists tl ON tl.id = t.list_id
    INNER JOIN workspace_boards wb ON wb.id = tl.board_id
    INNER JOIN task_assignees ta ON ta.task_id = t.id
    WHERE ta.user_id = p_user_id
      AND wb.ws_id = v_personal_ws_id
      AND (p_include_deleted OR t.deleted = FALSE)
      AND (p_list_statuses IS NULL OR tl.status = ANY(p_list_statuses));
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_accessible_tasks(UUID, UUID, BOOLEAN, task_board_status[]) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_user_accessible_tasks IS 'Returns all tasks accessible by a user. For personal workspaces, includes tasks assigned to user across all workspaces plus tasks in personal workspace boards. For non-personal workspaces, only returns tasks from that workspace assigned to the user.';
