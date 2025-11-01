-- Add created_at field and list/board info to match_tasks function return type
-- This allows the command center (Ctrl+K) to display task creation dates and list statuses

-- Step 1: Drop existing function
DROP FUNCTION IF EXISTS match_tasks(extensions.vector, text, float, int, uuid, boolean);

-- Step 2: Recreate match_tasks function with created_at and list/board fields
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
  list_name text,
  list_status task_board_status,
  board_id uuid,
  board_name text,
  priority task_priority,
  start_date timestamptz,
  end_date timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
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
  ),
  ranked_results AS (
    SELECT
      tasks.id,
      tasks.name,
      tasks.description,
      tasks.list_id,
      task_lists.name as list_name,
      task_lists.status as list_status,
      workspace_boards.id as board_id,
      workspace_boards.name as board_name,
      tasks.priority,
      tasks.start_date,
      tasks.end_date,
      tasks.completed_at,
      tasks.closed_at,
      tasks.created_at,
      cr.combined_score,
      -- Status priority: active/not_started = 1.0, done/closed = 0.5
      -- This boosts active tasks by ~15% in final ranking
      CASE
        WHEN task_lists.status IN ('active', 'not_started') THEN 1.0
        ELSE 0.5
      END as status_boost,
      -- Final score combines relevance with status boost
      (cr.combined_score * 0.85 +
       CASE
         WHEN task_lists.status IN ('active', 'not_started') THEN 0.15
         ELSE 0.0
       END) as final_score
    FROM combined_results cr
    INNER JOIN tasks ON tasks.id = cr.id
    INNER JOIN task_lists ON tasks.list_id = task_lists.id
    INNER JOIN workspace_boards ON task_lists.board_id = workspace_boards.id
    WHERE (filter_ws_id IS NULL OR workspace_boards.ws_id = filter_ws_id)
      AND (filter_deleted OR tasks.deleted_at IS NULL)
  )
  SELECT
    id,
    name,
    description,
    list_id,
    list_name,
    list_status,
    board_id,
    board_name,
    priority,
    start_date,
    end_date,
    completed_at,
    closed_at,
    created_at,
    combined_score::float as similarity
  FROM ranked_results
  ORDER BY final_score desc
  LIMIT least(match_count, 200);
END;
$$;

-- Step 3: Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION match_tasks(extensions.vector, text, float, int, uuid, boolean) TO authenticated;

-- Step 4: Add comment
COMMENT ON FUNCTION match_tasks IS 'Hybrid semantic and keyword search for tasks. Returns task details including list and board information, priority, timestamps (completed_at, closed_at, created_at), and list status. Results are ranked by weighted combination of semantic similarity (30%) and keyword relevance (70%).';
