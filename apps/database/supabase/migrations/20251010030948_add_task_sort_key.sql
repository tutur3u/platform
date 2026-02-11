-- Add sort_key column to tasks table for manual sorting within lists
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS sort_key DOUBLE PRECISION;  

-- Create index for efficient sorting queries
CREATE INDEX idx_tasks_list_sort ON public.tasks(list_id, sort_key) WHERE deleted = false;

-- Backfill existing tasks with sort_key based on created_at
-- Using row_number() to generate sequential values starting from 1000, incrementing by 1000
-- This gives plenty of room for reordering between existing tasks
WITH ranked_tasks AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY list_id ORDER BY created_at) * 1000 AS new_sort_key
  FROM public.tasks
  WHERE deleted = false
)
UPDATE public.tasks
SET sort_key = ranked_tasks.new_sort_key
FROM ranked_tasks
WHERE tasks.id = ranked_tasks.id;

-- Set default for new tasks to use a high value so they appear at the end
-- The application will handle calculating the actual sort_key based on position
ALTER TABLE public.tasks
ALTER COLUMN sort_key SET DEFAULT 1000000;
