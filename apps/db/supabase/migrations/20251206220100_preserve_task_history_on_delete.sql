-- Preserve task history when tasks are permanently deleted
-- Change from ON DELETE CASCADE to ON DELETE SET NULL
-- Also add a trigger to store task metadata before deletion for context preservation

-- Step 1: Drop ALL foreign key constraints referencing tasks(id) from task_history
-- Using a DO block to query the actual constraint name(s) from pg_constraint
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.task_history'::regclass
      AND confrelid = 'public.tasks'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE 'ALTER TABLE public.task_history DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Step 2: Make task_id nullable (required for SET NULL to work)
ALTER TABLE public.task_history
ALTER COLUMN task_id DROP NOT NULL;

-- Step 3: Add new foreign key constraint with SET NULL behavior
ALTER TABLE public.task_history
ADD CONSTRAINT task_history_task_id_fkey
FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Step 4: Create a trigger to store task metadata before deletion
-- This ensures we have task_name, board_id, workspace_id in metadata for permanently deleted tasks
CREATE OR REPLACE FUNCTION public.store_task_metadata_before_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_board_id UUID;
  v_ws_id UUID;
  v_board_name TEXT;
  v_list_name TEXT;
BEGIN
  -- Get the board_id, workspace_id, and names for metadata
  SELECT tl.board_id, wb.ws_id, wb.name, tl.name 
  INTO v_board_id, v_ws_id, v_board_name, v_list_name
  FROM public.task_lists tl
  JOIN public.workspace_boards wb ON tl.board_id = wb.id
  WHERE tl.id = OLD.list_id;

  -- Update all history entries for this task to include task metadata
  -- This ensures the history is still meaningful after task deletion
  UPDATE public.task_history
  SET metadata = metadata || jsonb_build_object(
    'task_name', OLD.name,
    'board_id', v_board_id,
    'board_name', v_board_name,
    'workspace_id', v_ws_id,
    'list_id', OLD.list_id,
    'list_name', v_list_name
  )
  WHERE task_id = OLD.id
    AND (metadata->>'task_name' IS NULL OR metadata->>'task_name' = '');

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create the trigger that fires before task deletion
DROP TRIGGER IF EXISTS store_task_metadata_before_delete_trigger ON public.tasks;
CREATE TRIGGER store_task_metadata_before_delete_trigger
  BEFORE DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.store_task_metadata_before_delete();

COMMENT ON FUNCTION public.store_task_metadata_before_delete IS 'Stores task metadata in task_history entries before a task is permanently deleted, ensuring history context is preserved.';

