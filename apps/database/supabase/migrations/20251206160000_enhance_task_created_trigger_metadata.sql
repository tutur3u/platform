-- Enhance task_created trigger to include more fields in metadata
-- This migration adds estimation_points, start_date, and end_date to the task creation history entry
-- These fields were requested by the user as they weren't being logged on task first creation

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
      'workspace_id', v_ws_id,
      'estimation_points', NEW.estimation_points,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_created IS 'Trigger function that creates a task_history entry when a new task is created. Captures initial state including name, description, priority, list placement, estimation_points, start_date, and end_date.';
