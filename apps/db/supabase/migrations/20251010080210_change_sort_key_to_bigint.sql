-- Change sort_key from DOUBLE PRECISION to BIGINT for better precision and performance
-- BIGINT provides exact integer arithmetic without floating-point precision issues

-- Step 1: Add new column with BIGINT type
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS sort_key_new BIGINT;

-- Step 2: Migrate existing data by multiplying by 1000 to preserve precision
-- This converts values like 1000.0 to 1000000, 1500.0 to 1500000, etc.
UPDATE public.tasks
SET sort_key_new = CASE
  WHEN sort_key IS NOT NULL THEN (sort_key * 1000)::BIGINT
  ELSE NULL
END;

-- Step 3: Drop the old column
ALTER TABLE public.tasks
DROP COLUMN IF EXISTS sort_key;

-- Step 4: Rename the new column to sort_key
ALTER TABLE public.tasks
RENAME COLUMN sort_key_new TO sort_key;

-- Step 5: Set default value for new tasks (1000000000 = 1000000 * 1000)
ALTER TABLE public.tasks
ALTER COLUMN sort_key SET DEFAULT 1000000000;

-- Step 6: Recreate the index with the new column type
DROP INDEX IF EXISTS idx_tasks_list_sort;
CREATE INDEX idx_tasks_list_sort ON public.tasks(list_id, sort_key) WHERE deleted = false;

-- Step 7: Update the normalization function to work with BIGINT
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
    -- Only update if tasks are too close together (< 100000 apart) or have nulls
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

-- Add comment to document the change
COMMENT ON COLUMN public.tasks.sort_key IS
  'BIGINT sort key for task ordering within lists. Uses integer math (multiply by 1000 compared to old DOUBLE PRECISION values) for exact precision without floating-point errors. Default spacing: 1000000 units apart.';
