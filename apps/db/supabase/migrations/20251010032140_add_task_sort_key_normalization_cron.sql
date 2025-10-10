-- Create a stored procedure to normalize task sort_keys
-- This ensures tasks are properly spaced (minimum 1000000 units apart)
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
    WHERE deleted = false
  LOOP
    task_counter := 0;

    -- Update sort_keys for all tasks in this list
    -- Only update if tasks are too close together (< 100 apart) or have nulls
    FOR task_record IN
      SELECT
        id,
        sort_key,
        ROW_NUMBER() OVER (ORDER BY sort_key NULLS LAST, created_at) as row_num
      FROM tasks
      WHERE list_id = list_record.list_id
        AND deleted = false
      ORDER BY sort_key NULLS LAST, created_at
    LOOP
      task_counter := task_counter + 1;
      new_sort_key := task_counter * 1000000;

      -- Only update if the sort_key is null or significantly different
      IF task_record.sort_key IS NULL
         OR ABS(task_record.sort_key - new_sort_key) > 500000 THEN
        UPDATE tasks
        SET sort_key = new_sort_key
        WHERE id = task_record.id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Schedule the normalization job to run every hour at minute 0
-- This prevents sort_key fragmentation over time while minimizing disruption
SELECT cron.schedule(
  'normalize-task-sort-keys',
  '0 * * * *',
  'SELECT normalize_task_sort_keys();'
);

-- Grant execute permission to authenticated users (for manual execution if needed)
GRANT EXECUTE ON FUNCTION normalize_task_sort_keys() TO authenticated;

-- Add comment to document the function
COMMENT ON FUNCTION normalize_task_sort_keys() IS
  'Normalizes task sort_keys to maintain minimum 1000000-unit spacing between tasks within each list. Runs hourly via pg_cron.';
