-- Fix trigger execution order issue by combining functionality into a single trigger
-- This eliminates the potential race condition between trg_normalize_task_tags and trg_ensure_tags_not_null

-- Drop the existing triggers and functions
DROP TRIGGER IF EXISTS trg_normalize_task_tags ON "public"."tasks";
DROP TRIGGER IF EXISTS trg_ensure_tags_not_null ON "public"."tasks";
DROP FUNCTION IF EXISTS normalize_task_tags_trigger();
DROP FUNCTION IF EXISTS ensure_tags_not_null();

-- Create a single combined trigger function that handles both operations in sequence
CREATE OR REPLACE FUNCTION handle_task_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Step 1: Ensure tags is not NULL (set to empty array if NULL)
  IF NEW.tags IS NULL THEN
    NEW.tags = ARRAY[]::text[];
  END IF;
  
  -- Step 2: Normalize tags if they exist and are not empty
  IF NEW.tags IS NOT NULL AND array_length(NEW.tags, 1) > 0 THEN
    NEW.tags = normalize_task_tags(NEW.tags);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create a single trigger that handles both operations
CREATE TRIGGER trg_handle_task_tags
  BEFORE INSERT OR UPDATE ON "public"."tasks"
  FOR EACH ROW
  EXECUTE FUNCTION handle_task_tags();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION handle_task_tags() TO authenticated; 