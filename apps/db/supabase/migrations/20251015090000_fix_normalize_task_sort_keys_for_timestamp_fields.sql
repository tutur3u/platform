-- Fix normalize_task_sort_keys function and related indexes to use timestamp fields
-- This migration updates references from deleted = false to deleted_at IS NULL

-- Step 1: Recreate the index to use deleted_at instead of deleted
DROP INDEX IF EXISTS idx_tasks_list_sort;
CREATE INDEX idx_tasks_list_sort ON public.tasks(list_id, sort_key) WHERE deleted_at IS NULL;

-- Step 2: Update the normalization function to use timestamp fields
CREATE OR REPLACE FUNCTION normalize_task_sort_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  list_record RECORD;
  task_record RECORD;
  new_sort_key BIGINT;
  task_counter INTEGER;
BEGIN
  -- Process each list separately
  FOR list_record IN
    SELECT DISTINCT list_id
    FROM tasks
    WHERE deleted_at IS NULL
  LOOP
    task_counter := 0;

    -- Update sort_keys for all tasks in this list
    -- Only update if tasks are too close together (< 100000 apart) or have nulls
    FOR task_record IN
      SELECT
        id,
        sort_key,
        ROW_NUMBER() OVER (ORDER BY sort_key NULLS LAST, created_at) as row_num
      FROM tasks
      WHERE list_id = list_record.list_id
        AND deleted_at IS NULL
      ORDER BY sort_key NULLS LAST, created_at
    LOOP
      task_counter := task_counter + 1;
      new_sort_key := task_counter * 1000000; -- 1000 * 1000 spacing

      -- Only update if the sort_key is null or significantly different
      IF task_record.sort_key IS NULL
         OR ABS(task_record.sort_key - new_sort_key) > 100000 THEN
        UPDATE tasks
        SET sort_key = new_sort_key
        WHERE id = task_record.id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Step 3: Add comment to document the function
COMMENT ON FUNCTION normalize_task_sort_keys() IS
  'Normalizes task sort_keys to maintain minimum 1000000-unit spacing between tasks within each list. Runs hourly via pg_cron. Uses deleted_at IS NULL instead of deleted = false.';
