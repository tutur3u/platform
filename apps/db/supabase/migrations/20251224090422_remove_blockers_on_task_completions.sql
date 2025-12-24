-- Migration: Remove blockers when task is marked as completed
--
-- When a task is completed, automatically remove blocking relationships
-- where this task was blocking other tasks. This unblocks dependent tasks.

-- Create trigger function to remove blockers on completion
CREATE OR REPLACE FUNCTION public.remove_blockers_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when task is newly completed (completed_at changes from NULL to a timestamp)
  IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
    -- Delete all 'blocks' relationships where this task was the blocker
    DELETE FROM public.task_relationships
    WHERE source_task_id = NEW.id
      AND type = 'blocks';
    
    -- Log the removal for debugging (optional)
    RAISE LOG 'Removed blocking relationships for completed task %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Ensure any existing trigger is removed before creating a new one (safe re-runs)
DROP TRIGGER IF EXISTS trigger_remove_blockers_on_completion ON public.tasks;

-- Create trigger that fires after task update
CREATE TRIGGER trigger_remove_blockers_on_completion
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_blockers_on_completion();

-- Add documentation
COMMENT ON FUNCTION public.remove_blockers_on_completion IS 
'Automatically removes blocking relationships when a task is marked as completed. This unblocks any tasks that were waiting on the completed task.';
