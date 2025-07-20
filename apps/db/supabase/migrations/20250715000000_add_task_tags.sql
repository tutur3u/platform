-- Add tags support to tasks table
-- This migration adds a tags array column to the tasks table for better task organization and filtering

-- Add tags column to tasks table
ALTER TABLE "public"."tasks" 
ADD COLUMN "tags" text[] DEFAULT '{}';

-- Create index for efficient tag-based queries
CREATE INDEX idx_tasks_tags ON "public"."tasks" USING GIN (tags);

-- Create index for tasks with specific tags (for filtering)
CREATE INDEX idx_tasks_tags_contains ON "public"."tasks" USING GIN (tags) WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

-- Add constraint to ensure tags are not null (empty array is fine)
ALTER TABLE "public"."tasks" 
ALTER COLUMN "tags" SET NOT NULL;

-- Add constraint to ensure tags array doesn't contain empty strings
ALTER TABLE "public"."tasks" 
ADD CONSTRAINT check_tags_not_empty_strings 
CHECK (NOT (tags && ARRAY['']));

-- Add constraint to limit tag length (max 50 characters per tag)
ALTER TABLE "public"."tasks" 
ADD CONSTRAINT check_tag_length 
CHECK (NOT EXISTS (
  SELECT 1 FROM unnest(tags) AS tag 
  WHERE length(tag) > 50
));

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
  RETURN ARRAY(
    SELECT DISTINCT lower(trim(tag))
    FROM unnest(tags) AS tag
    WHERE trim(tag) != ''
  );
END;
$$;

-- Create function to validate task tags
CREATE OR REPLACE FUNCTION validate_task_tags(tags text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Check if tags array is not null
  IF tags IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if any tag is empty string
  IF tags && ARRAY[''] THEN
    RETURN false;
  END IF;
  
  -- Check tag length
  IF EXISTS (
    SELECT 1 FROM unnest(tags) AS tag 
    WHERE length(tag) > 50
  ) THEN
    RETURN false;
  END IF;
  
  -- Check max number of tags
  IF array_length(tags, 1) > 20 THEN
    RETURN false;
  END IF;
  
  RETURN true;
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
  
  -- Validate tags
  IF NOT validate_task_tags(NEW.tags) THEN
    RAISE EXCEPTION 'Invalid task tags';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically normalize tags
CREATE TRIGGER normalize_task_tags_trigger
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
SECURITY DEFINER
AS $$
BEGIN
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
SECURITY DEFINER
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
GRANT EXECUTE ON FUNCTION validate_task_tags(text[]) TO authenticated;

-- Add comment to the column
COMMENT ON COLUMN "public"."tasks"."tags" IS 'Array of tags for task categorization and filtering. Tags are automatically normalized (trimmed, lowercase) and validated.'; 