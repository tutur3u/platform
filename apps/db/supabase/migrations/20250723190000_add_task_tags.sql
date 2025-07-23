-- Add tags support to tasks table
-- This migration adds a tags array column to the tasks table for better task organization and filtering

-- Add tags column to tasks table
ALTER TABLE "public"."tasks" 
ADD COLUMN "tags" text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Create index for efficient tag-based queries
CREATE INDEX idx_tasks_tags ON "public"."tasks" USING GIN (tags);

-- Add constraint to ensure tags array doesn't contain empty strings
ALTER TABLE "public"."tasks" 
ADD CONSTRAINT check_tags_not_empty_strings 
CHECK (NOT (tags && ARRAY['']));

-- Add constraint to limit number of tags per task (max 20 tags)
ALTER TABLE "public"."tasks" 
ADD CONSTRAINT check_max_tags 
CHECK (array_length(tags, 1) <= 20);

-- Create function to normalize tags (trim whitespace, lowercase)
CREATE OR REPLACE FUNCTION normalize_task_tags(tags text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Remove empty strings, trim whitespace, and convert to lowercase
  RETURN (
    SELECT array_agg(lower(trim(tag)) ORDER BY lower(trim(tag)))
    FROM (
      SELECT DISTINCT lower(trim(tag)) AS tag
      FROM unnest(tags)
      WHERE trim(tag) <> ''
    ) AS dedup
  );
END;
$$;

-- Create trigger function to normalize tags before insert/update
CREATE OR REPLACE FUNCTION normalize_task_tags_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Normalize tags before insert/update
  NEW.tags = normalize_task_tags(NEW.tags);
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically normalize tags
CREATE TRIGGER trg_normalize_task_tags
  BEFORE INSERT OR UPDATE ON "public"."tasks"
  FOR EACH ROW
  EXECUTE FUNCTION normalize_task_tags_trigger();

-- Create function to search tasks by tags
CREATE OR REPLACE FUNCTION search_tasks_by_tags(search_tags text[])
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  tags text[],
  list_id uuid,
  priority smallint,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Normalize the search tags to match the normalized tags stored in the database
  search_tags := normalize_task_tags(search_tags);
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.description,
    t.tags,
    t.list_id,
    t.priority,
    t.start_date,
    t.end_date,
    t.created_at
  FROM "public"."tasks" t
  WHERE t.deleted = false
    AND t.tags && search_tags; -- Check if any of the search tags exist in task tags
END;
$$;

-- Create function to get all unique tags from tasks in a board
CREATE OR REPLACE FUNCTION get_board_task_tags(board_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  all_tags text[];
BEGIN
  SELECT array_agg(DISTINCT unnest(t.tags))
  INTO all_tags
  FROM "public"."tasks" t
  JOIN "public"."task_lists" tl ON t.list_id = tl.id
  WHERE tl.board_id = board_id
    AND t.deleted = false
    AND tl.deleted = false
    AND t.tags IS NOT NULL
    AND array_length(t.tags, 1) > 0;
  
  RETURN COALESCE(all_tags, ARRAY[]::text[]);
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION search_tasks_by_tags(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_board_task_tags(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION normalize_task_tags(text[]) TO authenticated;

-- Add comment to the column
COMMENT ON COLUMN "public"."tasks"."tags" IS 'Array of tags for task categorization and filtering. Tags are automatically normalized (trimmed, lowercase) and validated.'; 