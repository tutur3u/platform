-- Update RPC functions to use timestamp fields instead of boolean fields
-- This migration updates:
-- 1. get_user_accessible_tasks - Remove archived, deleted, completed boolean columns
-- 2. match_tasks - Remove archived, completed boolean columns and deleted parameter

-- Step 1: Drop existing functions (required to change return type)
DROP FUNCTION IF EXISTS get_user_accessible_tasks(UUID, UUID, BOOLEAN, task_board_status[]);
DROP FUNCTION IF EXISTS match_tasks(extensions.vector, text, float, int, uuid, boolean);

-- Step 2: Recreate get_user_accessible_tasks function with new return type
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
  task_completed_at TIMESTAMPTZ,
  task_closed_at TIMESTAMPTZ,
  task_deleted_at TIMESTAMPTZ,
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
      t.completed_at,
      t.closed_at,
      t.deleted_at,
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
    AND (p_include_deleted OR t.deleted_at IS NULL)
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
      t.completed_at,
      t.closed_at,
      t.deleted_at,
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
      AND (p_include_deleted OR t.deleted_at IS NULL)
      AND (p_list_statuses IS NULL OR tl.status = ANY(p_list_statuses));
  END IF;
END;
$$;

-- Step 3: Recreate match_tasks function for semantic search with new return type
CREATE OR REPLACE FUNCTION match_tasks (
  query_embedding extensions.vector(768),
  query_text text,
  match_threshold float default 0.3,
  match_count int default 50,
  filter_ws_id uuid default null,
  filter_deleted boolean default false
) RETURNS TABLE (
  id uuid,
  name text,
  description text,
  list_id uuid,
  start_date timestamptz,
  end_date timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH semantic_search AS (
    SELECT
      tasks.id,
      (1.0 - (tasks.embedding <=> query_embedding)) as semantic_similarity,
      row_number() over (order by tasks.embedding <=> query_embedding) as semantic_rank
    FROM tasks
    INNER JOIN task_lists ON tasks.list_id = task_lists.id
    INNER JOIN workspace_boards ON task_lists.board_id = workspace_boards.id
    WHERE
      tasks.embedding IS NOT NULL
      AND (filter_ws_id IS NULL OR workspace_boards.ws_id = filter_ws_id)
      AND (filter_deleted OR tasks.deleted_at IS NULL)
    ORDER BY tasks.embedding <=> query_embedding
    LIMIT least(match_count * 3, 150)
  ),
  keyword_search AS (
    SELECT
      tasks.id,
      ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) as keyword_score,
      row_number() over (order by ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) desc) as keyword_rank
    FROM tasks
    INNER JOIN task_lists ON tasks.list_id = task_lists.id
    INNER JOIN workspace_boards ON task_lists.board_id = workspace_boards.id
    WHERE
      tasks.fts @@ websearch_to_tsquery('english', query_text)
      AND (filter_ws_id IS NULL OR workspace_boards.ws_id = filter_ws_id)
      AND (filter_deleted OR tasks.deleted_at IS NULL)
    ORDER BY ts_rank_cd(tasks.fts, websearch_to_tsquery('english', query_text)) desc
    LIMIT least(match_count * 3, 150)
  ),
  combined_results AS (
    SELECT
      coalesce(s.id, k.id) as id,
      coalesce(s.semantic_similarity, 0.0) as semantic_similarity,
      coalesce(k.keyword_score, 0.0) as keyword_score,
      -- Heavily weight keyword matches (70%) over semantic (30%)
      -- This ensures exact matches rank higher
      (coalesce(k.keyword_score, 0.0) * 0.7 + coalesce(s.semantic_similarity, 0.0) * 0.3) as combined_score
    FROM semantic_search s
    FULL OUTER JOIN keyword_search k ON s.id = k.id
  )
  SELECT
    tasks.id,
    tasks.name,
    tasks.description,
    tasks.list_id,
    tasks.start_date,
    tasks.end_date,
    tasks.completed_at,
    tasks.closed_at,
    cr.combined_score::float as similarity
  FROM combined_results cr
  INNER JOIN tasks ON tasks.id = cr.id
  INNER JOIN task_lists ON tasks.list_id = task_lists.id
  INNER JOIN workspace_boards ON task_lists.board_id = workspace_boards.id
  WHERE (filter_ws_id IS NULL OR workspace_boards.ws_id = filter_ws_id)
    AND (filter_deleted OR tasks.deleted_at IS NULL)
  ORDER BY cr.combined_score desc
  LIMIT least(match_count, 200);
END;
$$;

-- Step 4: Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_accessible_tasks(UUID, UUID, BOOLEAN, task_board_status[]) TO authenticated;
GRANT EXECUTE ON FUNCTION match_tasks(extensions.vector, text, float, int, uuid, boolean) TO authenticated;

-- Step 5: Add helpful comments
COMMENT ON FUNCTION get_user_accessible_tasks IS 'Returns all tasks accessible by a user. Uses timestamp fields (completed_at, closed_at, deleted_at) instead of booleans. For personal workspaces, includes tasks assigned to user across all workspaces plus tasks in personal workspace boards. For non-personal workspaces, only returns tasks from that workspace assigned to the user.';
COMMENT ON FUNCTION match_tasks IS 'Hybrid semantic and keyword search for tasks. Uses timestamp fields (completed_at, closed_at, deleted_at) instead of booleans. Returns tasks ranked by weighted combination of semantic similarity and keyword relevance.';
