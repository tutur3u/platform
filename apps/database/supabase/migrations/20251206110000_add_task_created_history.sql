-- Add task_created to allowed change_types and create trigger for tracking task creation

-- Step 1: Update the constraint to include task_created
ALTER TABLE public.task_history
DROP CONSTRAINT IF EXISTS task_history_change_type_check;

ALTER TABLE public.task_history
ADD CONSTRAINT task_history_change_type_check
CHECK (change_type IN (
  'task_created',
  'field_updated',
  'assignee_added',
  'assignee_removed',
  'label_added',
  'label_removed',
  'project_linked',
  'project_unlinked'
));

-- Step 2: Create trigger function for task creation
CREATE OR REPLACE FUNCTION public.notify_task_created()
RETURNS TRIGGER AS $$
DECLARE
  v_board_id UUID;
  v_ws_id UUID;
BEGIN
  -- Get the board_id and workspace_id for metadata
  SELECT tl.board_id, wb.ws_id INTO v_board_id, v_ws_id
  FROM public.task_lists tl
  JOIN public.workspace_boards wb ON tl.board_id = wb.id
  WHERE tl.id = NEW.list_id;

  INSERT INTO public.task_history (
    task_id, changed_by, changed_at, change_type,
    field_name, old_value, new_value, metadata
  ) VALUES (
    NEW.id,
    NEW.creator_id,
    NEW.created_at,
    'task_created',
    NULL,
    NULL,
    to_jsonb(NEW.name),
    jsonb_build_object(
      'description', NEW.description,
      'priority', NEW.priority,
      'list_id', NEW.list_id,
      'board_id', v_board_id,
      'workspace_id', v_ws_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create trigger on task INSERT
DROP TRIGGER IF EXISTS task_created_trigger ON public.tasks;
CREATE TRIGGER task_created_trigger
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_created();

-- Step 4: Backfill existing tasks with task_created history entries
-- This creates history entries for tasks that were created before this migration
INSERT INTO public.task_history (
  task_id, changed_by, changed_at, change_type,
  field_name, old_value, new_value, metadata
)
SELECT
  t.id,
  t.creator_id,
  t.created_at,
  'task_created',
  NULL,
  NULL,
  to_jsonb(t.name),
  jsonb_build_object(
    'description', t.description,
    'priority', t.priority,
    'list_id', t.list_id,
    'board_id', tl.board_id,
    'workspace_id', wb.ws_id
  )
FROM public.tasks t
JOIN public.task_lists tl ON t.list_id = tl.id
JOIN public.workspace_boards wb ON tl.board_id = wb.id
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.task_history th
    WHERE th.task_id = t.id AND th.change_type = 'task_created'
  );

-- Step 5: Add comment for documentation
COMMENT ON FUNCTION public.notify_task_created IS 'Trigger function that creates a task_history entry when a new task is created, capturing the initial state including name, description, priority, and list placement.';
