-- Fix database issue where something is trying to access a 'tag' column that doesn't exist
-- This migration will check and fix any database functions or triggers that might be causing this issue

-- First, let's check if there are any functions that might be referencing a 'tag' column
-- and drop them if they exist

-- Drop any problematic triggers first
DROP TRIGGER IF EXISTS trg_normalize_task_tags ON "public"."tasks";
DROP TRIGGER IF EXISTS trg_ensure_tags_not_null ON "public"."tasks";

-- Drop any problematic functions
DROP FUNCTION IF EXISTS normalize_task_tags_trigger();
DROP FUNCTION IF EXISTS ensure_tags_not_null();

-- Recreate the functions with proper column references
CREATE OR REPLACE FUNCTION normalize_task_tags_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only normalize tags if the column exists and is not null
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.tags IS NOT NULL THEN
      NEW.tags = normalize_task_tags(NEW.tags);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the ensure_tags_not_null function
CREATE OR REPLACE FUNCTION ensure_tags_not_null()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If tags is NULL, set it to empty array
  IF NEW.tags IS NULL THEN
    NEW.tags = ARRAY[]::text[];
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the triggers
CREATE TRIGGER trg_normalize_task_tags
  BEFORE INSERT OR UPDATE ON "public"."tasks"
  FOR EACH ROW
  EXECUTE FUNCTION normalize_task_tags_trigger();

CREATE TRIGGER trg_ensure_tags_not_null
  BEFORE INSERT OR UPDATE ON "public"."tasks"
  FOR EACH ROW
  EXECUTE FUNCTION ensure_tags_not_null();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION normalize_task_tags_trigger() TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_tags_not_null() TO authenticated; 