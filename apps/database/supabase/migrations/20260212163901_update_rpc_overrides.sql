-- Update get_user_accessible_tasks to support personal override filtering.
-- Two new optional parameters with backward-compatible defaults (FALSE).
-- When TRUE, tasks with personal completion or personal unassignment are excluded.

-- Drop the old 4-parameter overload first to avoid ambiguous function name.
DROP FUNCTION IF EXISTS public.get_user_accessible_tasks(UUID, UUID, BOOLEAN, public.task_board_status[]);

CREATE OR REPLACE FUNCTION public.get_user_accessible_tasks(
  p_user_id UUID,
  p_ws_id UUID DEFAULT NULL,
  p_include_deleted BOOLEAN DEFAULT FALSE,
  p_list_statuses public.task_board_status[] DEFAULT ARRAY['not_started', 'active']::public.task_board_status[],
  p_exclude_personally_completed BOOLEAN DEFAULT FALSE,
  p_exclude_personally_unassigned BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  task_id UUID,
  task_name TEXT,
  task_description TEXT,
  task_creator_id UUID,
  task_list_id UUID,
  task_start_date TIMESTAMPTZ,
  task_end_date TIMESTAMPTZ,
  task_priority public.task_priority,
  task_completed_at TIMESTAMPTZ,
  task_closed_at TIMESTAMPTZ,
  task_deleted_at TIMESTAMPTZ,
  task_estimation_points SMALLINT,
  task_created_at TIMESTAMPTZ
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
    FROM public.workspaces w
    INNER JOIN public.workspace_members wm ON wm.ws_id = w.id
    WHERE w.personal = TRUE
      AND wm.user_id = p_user_id
    LIMIT 1;
  ELSE
    v_personal_ws_id := p_ws_id;
  END IF;

  -- Check if the specified workspace is personal
  SELECT w.personal INTO v_is_personal
  FROM public.workspaces w
  WHERE w.id = v_personal_ws_id;

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
      t.completed_at,
      t.closed_at,
      t.deleted_at,
      t.estimation_points,
      t.created_at
    FROM public.tasks t
    INNER JOIN public.task_lists tl ON tl.id = t.list_id
    INNER JOIN public.workspace_boards wb ON wb.id = tl.board_id
    WHERE (
      -- Tasks assigned to the user (across all workspaces)
      EXISTS (
        SELECT 1 FROM public.task_assignees ta
        WHERE ta.task_id = t.id AND ta.user_id = p_user_id
      )
      -- OR tasks in personal workspace boards
      OR wb.ws_id = v_personal_ws_id
    )
    AND (p_include_deleted OR t.deleted_at IS NULL)
    AND (p_list_statuses IS NULL OR tl.status = ANY(p_list_statuses))
    AND wb.deleted_at IS NULL
    AND wb.archived_at IS NULL
    -- Exclude personally completed tasks
    AND (
      NOT p_exclude_personally_completed
      OR NOT EXISTS (
        SELECT 1 FROM public.task_user_overrides tuo
        WHERE tuo.task_id = t.id
          AND tuo.user_id = p_user_id
          AND tuo.completed_at IS NOT NULL
      )
    )
    -- Exclude personally unassigned tasks
    AND (
      NOT p_exclude_personally_unassigned
      OR NOT EXISTS (
        SELECT 1 FROM public.task_user_overrides tuo
        WHERE tuo.task_id = t.id
          AND tuo.user_id = p_user_id
          AND tuo.personally_unassigned = TRUE
      )
    );
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
      t.completed_at,
      t.closed_at,
      t.deleted_at,
      t.estimation_points,
      t.created_at
    FROM public.tasks t
    INNER JOIN public.task_lists tl ON tl.id = t.list_id
    INNER JOIN public.workspace_boards wb ON wb.id = tl.board_id
    INNER JOIN public.task_assignees ta ON ta.task_id = t.id
    WHERE ta.user_id = p_user_id
      AND wb.ws_id = v_personal_ws_id
      AND (p_include_deleted OR t.deleted_at IS NULL)
      AND (p_list_statuses IS NULL OR tl.status = ANY(p_list_statuses))
      AND wb.deleted_at IS NULL
      AND wb.archived_at IS NULL
      -- Exclude personally completed tasks
      AND (
        NOT p_exclude_personally_completed
        OR NOT EXISTS (
          SELECT 1 FROM public.task_user_overrides tuo
          WHERE tuo.task_id = t.id
            AND tuo.user_id = p_user_id
            AND tuo.completed_at IS NOT NULL
        )
      )
      -- Exclude personally unassigned tasks
      AND (
        NOT p_exclude_personally_unassigned
        OR NOT EXISTS (
          SELECT 1 FROM public.task_user_overrides tuo
          WHERE tuo.task_id = t.id
            AND tuo.user_id = p_user_id
            AND tuo.personally_unassigned = TRUE
        )
      );
  END IF;
END;
$$;

-- Grant the updated function signature to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_accessible_tasks(UUID, UUID, BOOLEAN, public.task_board_status[], BOOLEAN, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.get_user_accessible_tasks(UUID, UUID, BOOLEAN, public.task_board_status[], BOOLEAN, BOOLEAN) IS
  'Returns all tasks accessible by a user. Filters out tasks from deleted/archived boards. '
  'For personal workspaces, includes tasks assigned to user across all workspaces plus tasks in personal workspace boards. '
  'For non-personal workspaces, only returns tasks from that workspace assigned to the user. '
  'Supports personal override filtering: p_exclude_personally_completed and p_exclude_personally_unassigned '
  'allow hiding tasks the user has personally completed or unassigned from.';
