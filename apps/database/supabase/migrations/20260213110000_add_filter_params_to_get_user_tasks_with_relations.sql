-- Add server-side filter parameters to get_user_tasks_with_relations.
-- Drops the old signature (6 params) and recreates with 11 params.
-- All new params default to NULL/FALSE for backward compatibility.

DROP FUNCTION IF EXISTS public.get_user_tasks_with_relations(
  UUID, UUID, BOOLEAN, public.task_board_status[], BOOLEAN, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.get_user_tasks_with_relations(
  p_user_id UUID,
  p_ws_id UUID DEFAULT NULL,
  p_include_deleted BOOLEAN DEFAULT FALSE,
  p_list_statuses public.task_board_status[] DEFAULT ARRAY['not_started', 'active']::public.task_board_status[],
  p_exclude_personally_completed BOOLEAN DEFAULT FALSE,
  p_exclude_personally_unassigned BOOLEAN DEFAULT FALSE,
  -- New filter parameters
  p_filter_ws_ids UUID[] DEFAULT NULL,
  p_filter_board_ids UUID[] DEFAULT NULL,
  p_filter_label_ids UUID[] DEFAULT NULL,
  p_filter_project_ids UUID[] DEFAULT NULL,
  p_filter_self_managed_only BOOLEAN DEFAULT FALSE
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
  task_created_at TIMESTAMPTZ,
  sched_total_duration REAL,
  sched_is_splittable BOOLEAN,
  sched_min_split_duration_minutes REAL,
  sched_max_split_duration_minutes REAL,
  sched_calendar_hours TEXT,
  sched_auto_schedule BOOLEAN,
  override_self_managed BOOLEAN,
  override_completed_at TIMESTAMPTZ,
  override_priority_override public.task_priority,
  override_due_date_override TIMESTAMPTZ,
  override_estimation_override SMALLINT,
  override_personally_unassigned BOOLEAN,
  override_notes TEXT,
  list_data JSONB,
  assignees_data JSONB,
  labels_data JSONB,
  projects_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_personal_ws_id UUID;
  v_is_personal BOOLEAN;
BEGIN
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

  SELECT w.personal INTO v_is_personal
  FROM public.workspaces w
  WHERE w.id = v_personal_ws_id;

  RETURN QUERY
  SELECT
    t.id AS task_id,
    t.name AS task_name,
    t.description AS task_description,
    t.creator_id AS task_creator_id,
    t.list_id AS task_list_id,
    t.start_date AS task_start_date,
    t.end_date AS task_end_date,
    t.priority AS task_priority,
    t.completed_at AS task_completed_at,
    t.closed_at AS task_closed_at,
    t.deleted_at AS task_deleted_at,
    t.estimation_points AS task_estimation_points,
    t.created_at AS task_created_at,
    tuss.total_duration AS sched_total_duration,
    tuss.is_splittable AS sched_is_splittable,
    tuss.min_split_duration_minutes AS sched_min_split_duration_minutes,
    tuss.max_split_duration_minutes AS sched_max_split_duration_minutes,
    tuss.calendar_hours::TEXT AS sched_calendar_hours,
    tuss.auto_schedule AS sched_auto_schedule,
    tuo.self_managed AS override_self_managed,
    tuo.completed_at AS override_completed_at,
    tuo.priority_override AS override_priority_override,
    tuo.due_date_override AS override_due_date_override,
    tuo.estimation_override AS override_estimation_override,
    tuo.personally_unassigned AS override_personally_unassigned,
    tuo.notes AS override_notes,
    (
      SELECT jsonb_build_object(
        'id', tl.id,
        'name', tl.name,
        'status', tl.status,
        'board', jsonb_build_object(
          'id', wb.id,
          'name', wb.name,
          'ws_id', wb.ws_id,
          'estimation_type', wb.estimation_type,
          'extended_estimation', wb.extended_estimation,
          'allow_zero_estimates', wb.allow_zero_estimates,
          'workspaces', jsonb_build_object(
            'id', ws.id,
            'name', ws.name,
            'personal', ws.personal
          )
        )
      )
      FROM public.task_lists tl
      INNER JOIN public.workspace_boards wb ON wb.id = tl.board_id
      INNER JOIN public.workspaces ws ON ws.id = wb.ws_id
      WHERE tl.id = t.list_id
    ) AS list_data,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'user', jsonb_build_object(
              'id', u.id,
              'display_name', u.display_name,
              'avatar_url', u.avatar_url
            )
          )
        )
        FROM public.task_assignees ta_sub
        INNER JOIN public.users u ON u.id = ta_sub.user_id
        WHERE ta_sub.task_id = t.id
      ),
      '[]'::jsonb
    ) AS assignees_data,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'label', jsonb_build_object(
              'id', wtl.id,
              'name', wtl.name,
              'color', wtl.color,
              'created_at', wtl.created_at
            )
          )
        )
        FROM public.task_labels tl_sub
        INNER JOIN public.workspace_task_labels wtl ON wtl.id = tl_sub.label_id
        WHERE tl_sub.task_id = t.id
      ),
      '[]'::jsonb
    ) AS labels_data,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'project', jsonb_build_object(
              'id', tp.id,
              'name', tp.name,
              'description', tp.description,
              'ws_id', tp.ws_id,
              'creator_id', tp.creator_id,
              'created_at', tp.created_at,
              'updated_at', tp.updated_at,
              'archived', tp.archived,
              'deleted', tp.deleted,
              'status', tp.status
            )
          )
        )
        FROM public.task_project_tasks tpt
        INNER JOIN public.task_projects tp ON tp.id = tpt.project_id
        WHERE tpt.task_id = t.id
      ),
      '[]'::jsonb
    ) AS projects_data
  FROM public.tasks t
  INNER JOIN public.task_lists tl_filter ON tl_filter.id = t.list_id
  INNER JOIN public.workspace_boards wb_filter ON wb_filter.id = tl_filter.board_id
  LEFT JOIN public.task_user_scheduling_settings tuss
    ON tuss.task_id = t.id AND tuss.user_id = p_user_id
  LEFT JOIN public.task_user_overrides tuo
    ON tuo.task_id = t.id AND tuo.user_id = p_user_id
  WHERE
    CASE
      WHEN v_is_personal THEN
        (
          EXISTS (
            SELECT 1 FROM public.task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = p_user_id
          )
          OR wb_filter.ws_id = v_personal_ws_id
        )
      ELSE
        (
          EXISTS (
            SELECT 1 FROM public.task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = p_user_id
          )
          AND wb_filter.ws_id = v_personal_ws_id
        )
    END
    AND (p_include_deleted OR t.deleted_at IS NULL)
    AND (p_list_statuses IS NULL OR tl_filter.status = ANY(p_list_statuses))
    AND wb_filter.deleted_at IS NULL
    AND wb_filter.archived_at IS NULL
    AND (
      NOT p_exclude_personally_completed
      OR tuo.completed_at IS NULL
    )
    AND (
      NOT p_exclude_personally_unassigned
      OR COALESCE(tuo.personally_unassigned, FALSE) = FALSE
    )
    -- Server-side filters
    AND (p_filter_ws_ids IS NULL OR wb_filter.ws_id = ANY(p_filter_ws_ids))
    AND (p_filter_board_ids IS NULL OR wb_filter.id = ANY(p_filter_board_ids))
    AND (
      p_filter_label_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.task_labels tl_f
        WHERE tl_f.task_id = t.id AND tl_f.label_id = ANY(p_filter_label_ids)
      )
    )
    AND (
      p_filter_project_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.task_project_tasks tpt_f
        WHERE tpt_f.task_id = t.id AND tpt_f.project_id = ANY(p_filter_project_ids)
      )
    )
    AND (
      NOT p_filter_self_managed_only
      OR COALESCE(tuo.self_managed, FALSE) = TRUE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tasks_with_relations(
  UUID, UUID, BOOLEAN, public.task_board_status[], BOOLEAN, BOOLEAN,
  UUID[], UUID[], UUID[], UUID[], BOOLEAN
) TO authenticated;

COMMENT ON FUNCTION public.get_user_tasks_with_relations IS
  'Consolidated RPC that returns tasks with all relations (scheduling, overrides, '
  'list/board metadata, assignees, labels, projects) in a single query. '
  'Supports server-side filtering by workspace, board, label, project, and self-managed status. '
  'Replaces the pattern of get_user_accessible_tasks + 6 parallel relation queries.';
