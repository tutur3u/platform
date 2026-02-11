-- Migration: Task Relationships (Parent-Child, Blocking, Related)
--
-- This migration creates a unified table for managing task relationships:
-- 1. parent_child: Sub-tasks / sub-issues (child can only have one parent)
-- 2. blocks: Task A blocks Task B (A must be completed before B can start)
-- 3. blocked_by: Task A is blocked by Task B (inverse of blocks, for querying convenience)
-- 4. related: Related tasks (bidirectional relationship)

-- Create enum for relationship types
CREATE TYPE task_relationship_type AS ENUM (
  'parent_child',  -- Source is parent, target is child (sub-task)
  'blocks',        -- Source blocks target (source must complete first)
  'related'        -- Source and target are related (informational)
);

-- Create the unified task_relationships table
CREATE TABLE IF NOT EXISTS public.task_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The source task in the relationship
  source_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,

  -- The target task in the relationship
  target_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,

  -- Type of relationship
  type task_relationship_type NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Ensure source and target are different tasks
  CONSTRAINT task_relationships_no_self_reference CHECK (source_task_id != target_task_id),

  -- Unique constraint: prevent duplicate relationships of the same type
  -- For parent_child: a child can only have ONE parent (enforced by trigger)
  -- For blocks/related: prevent exact duplicates
  CONSTRAINT task_relationships_unique_relationship UNIQUE (source_task_id, target_task_id, type)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_task_relationships_source ON public.task_relationships(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relationships_target ON public.task_relationships(target_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relationships_type ON public.task_relationships(type);

-- Composite index for common queries (e.g., find all children of a task)
CREATE INDEX IF NOT EXISTS idx_task_relationships_source_type ON public.task_relationships(source_task_id, type);
CREATE INDEX IF NOT EXISTS idx_task_relationships_target_type ON public.task_relationships(target_task_id, type);

-- Comments for documentation
COMMENT ON TABLE public.task_relationships IS 'Unified table for task relationships: parent-child (sub-tasks), blocking dependencies, and related tasks';
COMMENT ON COLUMN public.task_relationships.source_task_id IS 'The source task. For parent_child: the parent. For blocks: the blocking task. For related: either task.';
COMMENT ON COLUMN public.task_relationships.target_task_id IS 'The target task. For parent_child: the child/sub-task. For blocks: the blocked task. For related: either task.';
COMMENT ON COLUMN public.task_relationships.type IS 'Type of relationship: parent_child (sub-task), blocks (dependency), or related (informational)';

-- =============================================================================
-- TRIGGER: Enforce single parent constraint for parent_child relationships
-- =============================================================================
-- A child task (target) can only have ONE parent task (source)

CREATE OR REPLACE FUNCTION public.enforce_single_parent_constraint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only check for parent_child relationships
  IF NEW.type = 'parent_child' THEN
    -- Check if the target task already has a parent
    IF EXISTS (
      SELECT 1
      FROM public.task_relationships
      WHERE target_task_id = NEW.target_task_id
        AND type = 'parent_child'
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'Task % already has a parent. A sub-task can only have one parent.', NEW.target_task_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure any existing trigger is removed before creating a new one (safe re-runs)
DROP TRIGGER IF EXISTS trigger_enforce_single_parent ON public.task_relationships;
CREATE TRIGGER trigger_enforce_single_parent
  BEFORE INSERT OR UPDATE ON public.task_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_parent_constraint();

-- =============================================================================
-- TRIGGER: Prevent circular parent-child relationships
-- =============================================================================
-- Prevents: A -> B -> C -> A (circular dependency in parent-child hierarchy)

CREATE OR REPLACE FUNCTION public.prevent_circular_parent_child()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_task_id UUID;
  v_depth INT := 0;
  v_max_depth INT := 100; -- Prevent infinite loops
BEGIN
  -- Only check for parent_child relationships
  IF NEW.type != 'parent_child' THEN
    RETURN NEW;
  END IF;

  -- Walk up the parent chain from the new parent (source) to check if we encounter the new child (target)
  v_current_task_id := NEW.source_task_id;

  WHILE v_current_task_id IS NOT NULL AND v_depth < v_max_depth LOOP
    -- Check if we've reached the task we're trying to make a child
    IF v_current_task_id = NEW.target_task_id THEN
      RAISE EXCEPTION 'Circular parent-child relationship detected. Task % cannot be a child of task % because it would create a cycle.', NEW.target_task_id, NEW.source_task_id;
    END IF;

    -- Move up to the parent
    SELECT source_task_id INTO v_current_task_id
    FROM public.task_relationships
    WHERE target_task_id = v_current_task_id
      AND type = 'parent_child';

    v_depth := v_depth + 1;
  END LOOP;

  -- Also check if the source is already a descendant of target (walking down)
  -- This prevents making a parent out of a child
  v_current_task_id := NEW.target_task_id;
  v_depth := 0;

  -- Use recursive CTE to find all descendants
  IF EXISTS (
    WITH RECURSIVE descendants AS (
      -- Base case: direct children of the target
      SELECT target_task_id AS task_id
      FROM public.task_relationships
      WHERE source_task_id = NEW.target_task_id
        AND type = 'parent_child'

      UNION ALL

      -- Recursive case: children of children
      SELECT tr.target_task_id
      FROM public.task_relationships tr
      INNER JOIN descendants d ON tr.source_task_id = d.task_id
      WHERE tr.type = 'parent_child'
    )
    SELECT 1 FROM descendants WHERE task_id = NEW.source_task_id
  ) THEN
    RAISE EXCEPTION 'Circular parent-child relationship detected. Task % is already a descendant of task %.', NEW.source_task_id, NEW.target_task_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_circular_parent_child ON public.task_relationships;
CREATE TRIGGER trigger_prevent_circular_parent_child
  BEFORE INSERT OR UPDATE ON public.task_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_circular_parent_child();

-- =============================================================================
-- TRIGGER: Ensure related relationships are bidirectional (or prevent duplicates)
-- =============================================================================
-- For "related" type, prevent creating A->B if B->A already exists (they're equivalent)

CREATE OR REPLACE FUNCTION public.normalize_related_relationship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only check for related relationships
  IF NEW.type = 'related' THEN
    -- Check if the inverse relationship already exists
    IF EXISTS (
      SELECT 1
      FROM public.task_relationships
      WHERE source_task_id = NEW.target_task_id
        AND target_task_id = NEW.source_task_id
        AND type = 'related'
    ) THEN
      RAISE EXCEPTION 'Related relationship already exists between tasks % and %. Related relationships are bidirectional.', NEW.source_task_id, NEW.target_task_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_normalize_related_relationship ON public.task_relationships;
CREATE TRIGGER trigger_normalize_related_relationship
  BEFORE INSERT OR UPDATE ON public.task_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_related_relationship();

-- =============================================================================
-- TRIGGER: Ensure tasks are from the same board (workspace scope validation)
-- =============================================================================
-- Tasks in a relationship should belong to the same workspace (via board_id)

CREATE OR REPLACE FUNCTION public.validate_task_relationship_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source_board_id UUID;
  v_target_board_id UUID;
  v_source_ws_id UUID;
  v_target_ws_id UUID;
BEGIN
  -- Get board_id for both tasks
  SELECT board_id INTO v_source_board_id FROM public.tasks WHERE id = NEW.source_task_id;
  SELECT board_id INTO v_target_board_id FROM public.tasks WHERE id = NEW.target_task_id;

  -- If both tasks have board_ids, verify they're in the same workspace
  IF v_source_board_id IS NOT NULL AND v_target_board_id IS NOT NULL THEN
    SELECT ws_id INTO v_source_ws_id FROM public.workspace_boards WHERE id = v_source_board_id;
    SELECT ws_id INTO v_target_ws_id FROM public.workspace_boards WHERE id = v_target_board_id;

    IF v_source_ws_id != v_target_ws_id THEN
      RAISE EXCEPTION 'Task relationships can only be created between tasks in the same workspace.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_task_relationship_scope ON public.task_relationships;
CREATE TRIGGER trigger_validate_task_relationship_scope
  BEFORE INSERT OR UPDATE ON public.task_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_task_relationship_scope();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.task_relationships ENABLE ROW LEVEL SECURITY;

-- Ensure policies are recreated idempotently
DROP POLICY IF EXISTS "Users can view task relationships in their workspaces" ON public.task_relationships;
CREATE POLICY "Users can view task relationships in their workspaces"
  ON public.task_relationships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      INNER JOIN public.workspace_boards wb ON t.board_id = wb.id
      INNER JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
      WHERE t.id = task_relationships.source_task_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create task relationships in their workspaces" ON public.task_relationships;
CREATE POLICY "Users can create task relationships in their workspaces"
  ON public.task_relationships
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      INNER JOIN public.workspace_boards wb ON t.board_id = wb.id
      INNER JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
      WHERE t.id = source_task_id
        AND wm.user_id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1
      FROM public.tasks t
      INNER JOIN public.workspace_boards wb ON t.board_id = wb.id
      INNER JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
      WHERE t.id = target_task_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update task relationships in their workspaces" ON public.task_relationships;
CREATE POLICY "Users can update task relationships in their workspaces"
  ON public.task_relationships
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      INNER JOIN public.workspace_boards wb ON t.board_id = wb.id
      INNER JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
      WHERE t.id = task_relationships.source_task_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete task relationships in their workspaces" ON public.task_relationships;
CREATE POLICY "Users can delete task relationships in their workspaces"
  ON public.task_relationships
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      INNER JOIN public.workspace_boards wb ON t.board_id = wb.id
      INNER JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
      WHERE t.id = task_relationships.source_task_id
        AND wm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- HELPER FUNCTIONS FOR QUERYING RELATIONSHIPS
-- =============================================================================

-- Function: Get all children (sub-tasks) of a task
CREATE OR REPLACE FUNCTION public.get_task_children(p_task_id UUID)
RETURNS TABLE (
  task_id UUID,
  depth INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE children AS (
    -- Base case: direct children
    SELECT target_task_id AS task_id, 1 AS depth
    FROM public.task_relationships
    WHERE source_task_id = p_task_id
      AND type = 'parent_child'

    UNION ALL

    -- Recursive case: children of children
    SELECT tr.target_task_id, c.depth + 1
    FROM public.task_relationships tr
    INNER JOIN children c ON tr.source_task_id = c.task_id
    WHERE tr.type = 'parent_child'
      AND c.depth < 100 -- Prevent infinite recursion
  )
  SELECT * FROM children;
$$;

COMMENT ON FUNCTION public.get_task_children IS 'Returns all descendant tasks (children, grandchildren, etc.) of a given task with their depth level';

-- Function: Get the parent hierarchy of a task
CREATE OR REPLACE FUNCTION public.get_task_parents(p_task_id UUID)
RETURNS TABLE (
  task_id UUID,
  depth INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE parents AS (
    -- Base case: direct parent
    SELECT source_task_id AS task_id, 1 AS depth
    FROM public.task_relationships
    WHERE target_task_id = p_task_id
      AND type = 'parent_child'

    UNION ALL

    -- Recursive case: parent of parent
    SELECT tr.source_task_id, p.depth + 1
    FROM public.task_relationships tr
    INNER JOIN parents p ON tr.target_task_id = p.task_id
    WHERE tr.type = 'parent_child'
      AND p.depth < 100 -- Prevent infinite recursion
  )
  SELECT * FROM parents;
$$;

COMMENT ON FUNCTION public.get_task_parents IS 'Returns all ancestor tasks (parent, grandparent, etc.) of a given task with their depth level';

-- Function: Get all tasks blocking a given task
CREATE OR REPLACE FUNCTION public.get_blocking_tasks(p_task_id UUID)
RETURNS TABLE (task_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT source_task_id AS task_id
  FROM public.task_relationships
  WHERE target_task_id = p_task_id
    AND type = 'blocks';
$$;

COMMENT ON FUNCTION public.get_blocking_tasks IS 'Returns all tasks that are blocking the given task';

-- Function: Get all tasks blocked by a given task
CREATE OR REPLACE FUNCTION public.get_blocked_tasks(p_task_id UUID)
RETURNS TABLE (task_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT target_task_id AS task_id
  FROM public.task_relationships
  WHERE source_task_id = p_task_id
    AND type = 'blocks';
$$;

COMMENT ON FUNCTION public.get_blocked_tasks IS 'Returns all tasks that are blocked by the given task';

-- Function: Get all related tasks
CREATE OR REPLACE FUNCTION public.get_related_tasks(p_task_id UUID)
RETURNS TABLE (task_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Related tasks can be in either direction
  SELECT target_task_id AS task_id
  FROM public.task_relationships
  WHERE source_task_id = p_task_id
    AND type = 'related'

  UNION

  SELECT source_task_id AS task_id
  FROM public.task_relationships
  WHERE target_task_id = p_task_id
    AND type = 'related';
$$;

COMMENT ON FUNCTION public.get_related_tasks IS 'Returns all tasks related to the given task (bidirectional)';
