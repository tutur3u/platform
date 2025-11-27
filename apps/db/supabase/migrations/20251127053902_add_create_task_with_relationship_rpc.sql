-- Migration: Add RPC function for creating a task with relationship atomically
--
-- This function creates a new task and establishes a relationship with an existing task
-- in a single atomic transaction, ensuring data consistency.

CREATE OR REPLACE FUNCTION public.create_task_with_relationship(
  p_name TEXT,
  p_list_id UUID,
  p_current_task_id UUID,
  p_relationship_type task_relationship_type,
  p_current_task_is_source BOOLEAN,
  p_description TEXT DEFAULT NULL,
  p_priority SMALLINT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_estimation_points SMALLINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new_task_id UUID;
  v_new_task JSONB;
  v_relationship JSONB;
  v_source_task_id UUID;
  v_target_task_id UUID;
  v_relationship_id UUID;
  v_highest_sort_key BIGINT;
  v_new_sort_key BIGINT;
  v_user_id UUID;
  v_list_exists BOOLEAN;
  v_current_task_exists BOOLEAN;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Validate inputs
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Task name is required';
  END IF;

  IF p_list_id IS NULL THEN
    RAISE EXCEPTION 'List ID is required';
  END IF;

  IF p_current_task_id IS NULL THEN
    RAISE EXCEPTION 'Current task ID is required';
  END IF;

  -- Verify the list exists and get board_id for RLS check
  SELECT EXISTS(
    SELECT 1 FROM task_lists WHERE id = p_list_id
  ) INTO v_list_exists;

  IF NOT v_list_exists THEN
    RAISE EXCEPTION 'List not found or access denied';
  END IF;

  -- Verify the current task exists
  SELECT EXISTS(
    SELECT 1 FROM tasks WHERE id = p_current_task_id AND deleted_at IS NULL
  ) INTO v_current_task_exists;

  IF NOT v_current_task_exists THEN
    RAISE EXCEPTION 'Current task not found';
  END IF;

  -- Get the highest sort_key in the list to place new task at the end
  SELECT COALESCE(MAX(sort_key), 0)
  INTO v_highest_sort_key
  FROM tasks
  WHERE list_id = p_list_id
    AND deleted_at IS NULL;

  -- Calculate new sort key (add 1,000,000 for proper spacing)
  v_new_sort_key := v_highest_sort_key + 1000000;

  -- Create the new task
  -- Note: display_number and board_id are auto-assigned by database trigger
  INSERT INTO tasks (
    name,
    description,
    list_id,
    priority,
    start_date,
    end_date,
    estimation_points,
    sort_key,
    creator_id,
    created_at
  )
  VALUES (
    trim(p_name),
    p_description,
    p_list_id,
    p_priority,
    p_start_date,
    p_end_date,
    p_estimation_points,
    v_new_sort_key,
    v_user_id,
    now()
  )
  RETURNING id INTO v_new_task_id;

  -- Determine source and target based on relationship direction
  IF p_current_task_is_source THEN
    v_source_task_id := p_current_task_id;
    v_target_task_id := v_new_task_id;
  ELSE
    v_source_task_id := v_new_task_id;
    v_target_task_id := p_current_task_id;
  END IF;

  -- Create the relationship
  INSERT INTO task_relationships (
    source_task_id,
    target_task_id,
    type,
    created_by,
    created_at
  )
  VALUES (
    v_source_task_id,
    v_target_task_id,
    p_relationship_type,
    v_user_id,
    now()
  )
  RETURNING id INTO v_relationship_id;

  -- Fetch the complete task data with relations for the response
  SELECT jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'description', t.description,
    'list_id', t.list_id,
    'board_id', t.board_id,
    'display_number', t.display_number,
    'priority', t.priority,
    'start_date', t.start_date,
    'end_date', t.end_date,
    'estimation_points', t.estimation_points,
    'sort_key', t.sort_key,
    'completed', t.completed,
    'completed_at', t.completed_at,
    'closed_at', t.closed_at,
    'archived', t.archived,
    'creator_id', t.creator_id,
    'created_at', t.created_at,
    'assignees', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'user', jsonb_build_object(
            'id', u.id,
            'display_name', u.display_name,
            'avatar_url', u.avatar_url
          )
        )
      )
      FROM task_assignees ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id = t.id
    ), '[]'::jsonb),
    'labels', COALESCE((
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
      FROM task_labels tl
      JOIN workspace_task_labels wtl ON tl.label_id = wtl.id
      WHERE tl.task_id = t.id
    ), '[]'::jsonb),
    'projects', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'project', jsonb_build_object(
            'id', tp.id,
            'name', tp.name,
            'status', tp.status
          )
        )
      )
      FROM task_project_tasks tpt
      JOIN task_projects tp ON tpt.project_id = tp.id
      WHERE tpt.task_id = t.id
    ), '[]'::jsonb)
  )
  INTO v_new_task
  FROM tasks t
  WHERE t.id = v_new_task_id;

  -- Build relationship response
  SELECT jsonb_build_object(
    'id', tr.id,
    'source_task_id', tr.source_task_id,
    'target_task_id', tr.target_task_id,
    'type', tr.type,
    'created_at', tr.created_at,
    'created_by', tr.created_by
  )
  INTO v_relationship
  FROM task_relationships tr
  WHERE tr.id = v_relationship_id;

  -- Return both the task and relationship
  RETURN jsonb_build_object(
    'task', v_new_task,
    'relationship', v_relationship
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Handle duplicate relationship
    RAISE EXCEPTION 'This relationship already exists.';
  WHEN OTHERS THEN
    -- Re-raise other errors
    RAISE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_task_with_relationship(
  TEXT, UUID, UUID, task_relationship_type, BOOLEAN, TEXT, SMALLINT, TIMESTAMPTZ, TIMESTAMPTZ, SMALLINT
) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.create_task_with_relationship IS 
'Creates a new task and establishes a relationship with an existing task atomically.
Parameters:
- p_name: Name of the new task (required)
- p_list_id: ID of the list where the task will be created (required)
- p_current_task_id: ID of the existing task to relate to (required)
- p_relationship_type: Type of relationship (parent_child, blocks, related)
- p_current_task_is_source: Whether the current task is the source of the relationship
  - For parent: false (new task is parent, current is child)
  - For child/subtask: true (current task is parent, new is child)
  - For blocks: true (current task blocks new task)
  - For blocked-by: false (new task blocks current task)
  - For related: true (direction does not matter)
- p_description: Optional task description
- p_priority: Optional priority (smallint)
- p_start_date: Optional start date
- p_end_date: Optional end date
- p_estimation_points: Optional estimation points (0-8)

Returns JSONB with task and relationship objects.';
