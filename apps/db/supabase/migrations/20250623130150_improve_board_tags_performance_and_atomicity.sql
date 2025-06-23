-- Improve board tags functionality with performance optimizations and atomic operations
-- This migration enhances the existing board tags system without breaking changes

-- Drop and recreate the index with jsonb_path_ops for better performance
-- Using CONCURRENTLY to prevent write locks during index changes
DROP INDEX CONCURRENTLY IF EXISTS idx_workspace_boards_tags;

-- Create two indexes:
-- 1. jsonb_path_ops for containment (@>) queries
-- 2. default jsonb_ops for existence (?&, ?|) operators
CREATE INDEX CONCURRENTLY idx_workspace_boards_tags_path ON workspace_boards USING gin(tags jsonb_path_ops);
CREATE INDEX CONCURRENTLY idx_workspace_boards_tags ON workspace_boards USING gin(tags);

-- Improve functions to be IMMUTABLE for better performance and caching
-- Simplified tag normalization using set-based JSONB functions
CREATE OR REPLACE FUNCTION validate_and_normalize_board_tags(tags jsonb)
RETURNS jsonb AS $$
DECLARE
  normalized_tags jsonb;
  tag_count integer;
BEGIN
  -- Check if tags is an array
  IF jsonb_typeof(tags) != 'array' THEN
    RAISE EXCEPTION 'Tags must be a JSON array';
  END IF;
  
  -- Check maximum number of tags (limit to 20 tags per board)
  tag_count := jsonb_array_length(tags);
  IF tag_count > 20 THEN
    RAISE EXCEPTION 'Maximum of 20 tags allowed per board';
  END IF;

  -- Process tags using set-based operations
  SELECT jsonb_agg(DISTINCT normalized_tag ORDER BY normalized_tag)
  INTO normalized_tags
  FROM (
    SELECT trim(lower(value)) AS normalized_tag
    FROM jsonb_array_elements_text(tags) AS t(value)
    WHERE 
      -- Validate tag format
      trim(lower(value)) ~ '^[a-z0-9_-]+$'
      -- Validate tag length (1-50 characters)
      AND length(trim(lower(value))) BETWEEN 1 AND 50
  ) sub;

  -- Handle case where all tags were invalid
  IF normalized_tags IS NULL THEN
    normalized_tags := '[]'::jsonb;
  END IF;

  -- Validate that we have valid tags if input was non-empty
  IF tag_count > 0 AND jsonb_array_length(normalized_tags) = 0 THEN
    RAISE EXCEPTION 'No valid tags found. Tags must be 1-50 characters and contain only lowercase letters, numbers, hyphens, and underscores';
  END IF;

  RETURN normalized_tags;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Improve validation function with specific error handling
CREATE OR REPLACE FUNCTION validate_board_tags(tags jsonb)
RETURNS boolean AS $$
BEGIN
  -- Use the normalize function for validation, but catch specific exceptions
  BEGIN
    PERFORM validate_and_normalize_board_tags(tags);
    RETURN true;
  EXCEPTION
    -- Only catch the specific exceptions we raise in validate_and_normalize_board_tags
    WHEN SQLSTATE '22000' THEN  -- our custom validation errors
      RETURN false;
    WHEN OTHERS THEN
      -- Re-raise unexpected errors to avoid masking bugs
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add constraint using the validation function
ALTER TABLE workspace_boards 
ADD CONSTRAINT workspace_boards_valid_tags 
CHECK (validate_board_tags(tags));

-- Improve add_board_tags function with atomic operations and better error handling
-- Uses atomic UPDATE ... RETURNING to prevent race conditions
CREATE OR REPLACE FUNCTION add_board_tags(board_id uuid, new_tags text[])
RETURNS jsonb AS $$
DECLARE
  new_tags_jsonb jsonb;
  result_tags jsonb;
BEGIN
  -- Convert text array to jsonb array
  SELECT jsonb_agg(value) INTO new_tags_jsonb
  FROM unnest(new_tags) AS value;
  
  -- Handle empty array case
  IF new_tags_jsonb IS NULL THEN
    new_tags_jsonb := '[]'::jsonb;
  END IF;
  
  -- Atomic update with tag combination and normalization
  UPDATE workspace_boards 
  SET tags = validate_and_normalize_board_tags(tags || new_tags_jsonb)
  WHERE id = board_id
  RETURNING tags INTO result_tags;
  
  -- Check if board was found and updated
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Board not found';
  END IF;
  
  RETURN result_tags;
END;
$$ LANGUAGE plpgsql;

-- Improve remove_board_tags function with atomic operations and better performance
-- Uses atomic UPDATE with jsonb operations to prevent race conditions
CREATE OR REPLACE FUNCTION remove_board_tags(board_id uuid, tags_to_remove text[])
RETURNS jsonb AS $$
DECLARE
  normalized_remove_tags text[];
  result_tags jsonb;
BEGIN
  -- Normalize tags to remove (lowercase and trim)
  SELECT array_agg(lower(trim(tag))) 
  INTO normalized_remove_tags
  FROM unnest(tags_to_remove) AS tag
  WHERE trim(tag) != '';
  
  -- Handle empty array case
  IF normalized_remove_tags IS NULL THEN
    normalized_remove_tags := ARRAY[]::text[];
  END IF;
  
  -- Atomic update: filter out tags using jsonb operations
  UPDATE workspace_boards 
  SET tags = COALESCE((
    SELECT jsonb_agg(tag_elem ORDER BY tag_elem)
    FROM jsonb_array_elements_text(tags) AS tag_elem
    WHERE NOT (tag_elem = ANY(normalized_remove_tags))
  ), '[]'::jsonb)
  WHERE id = board_id
  RETURNING tags INTO result_tags;
  
  -- Check if board was found and updated
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Board not found';
  END IF;
  
  RETURN result_tags;
END;
$$ LANGUAGE plpgsql;

-- Improve search function with empty array handling and deterministic ordering
CREATE OR REPLACE FUNCTION search_boards_by_tags(
  workspace_id uuid, 
  search_tags text[], 
  match_all boolean DEFAULT false
)
RETURNS TABLE(board_id uuid, board_name text, board_tags jsonb) AS $$
BEGIN
  -- Handle empty search_tags: return all boards for the workspace
  IF array_length(search_tags, 1) IS NULL THEN
    RETURN QUERY
    SELECT wb.id, wb.name, wb.tags
    FROM workspace_boards wb
    WHERE wb.workspace_id = workspace_id
    ORDER BY wb.name, wb.id;
    RETURN;
  END IF;

  IF match_all THEN
    -- Return boards that have ALL specified tags
    RETURN QUERY
    SELECT wb.id, wb.name, wb.tags
    FROM workspace_boards wb
    WHERE wb.workspace_id = workspace_id
      AND wb.tags ?& search_tags
    ORDER BY wb.name, wb.id;
  ELSE
    -- Return boards that have ANY of the specified tags
    RETURN QUERY
    SELECT wb.id, wb.name, wb.tags
    FROM workspace_boards wb
    WHERE wb.workspace_id = workspace_id
      AND wb.tags ?| search_tags
    ORDER BY wb.name, wb.id;
  END IF;
END;
$$ LANGUAGE plpgsql;
