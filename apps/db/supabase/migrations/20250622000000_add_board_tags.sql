-- Add tags column to workspace_boards table
-- Tags will be stored as a JSONB array of strings for flexibility and performance
-- Each tag should be 1-50 characters, lowercase, trimmed, and unique within the array
ALTER TABLE workspace_boards 
ADD COLUMN tags JSONB DEFAULT '[]'::jsonb;

-- Create index for better performance when filtering by tags
CREATE INDEX idx_workspace_boards_tags ON workspace_boards USING gin(tags);

-- Add check constraint to ensure tags is always an array
ALTER TABLE workspace_boards 
ADD CONSTRAINT workspace_boards_tags_is_array 
CHECK (jsonb_typeof(tags) = 'array');

-- Enhanced function to validate and normalize tag format
CREATE OR REPLACE FUNCTION validate_and_normalize_board_tags(tags jsonb)
RETURNS jsonb AS $$
DECLARE
  normalized_tags jsonb := '[]'::jsonb;
  tag_text text;
  trimmed_tag text;
  i integer;
BEGIN
  -- Check if tags is an array
  IF jsonb_typeof(tags) != 'array' THEN
    RAISE EXCEPTION 'Tags must be a JSON array';
  END IF;
  
  -- Check maximum number of tags (limit to 20 tags per board)
  IF jsonb_array_length(tags) > 20 THEN
    RAISE EXCEPTION 'Maximum of 20 tags allowed per board';
  END IF;
  
  -- Process each tag: validate, normalize, and deduplicate
  FOR i IN 0..jsonb_array_length(tags) - 1 LOOP
    -- Extract tag text
    IF jsonb_typeof(tags->i) != 'string' THEN
      RAISE EXCEPTION 'All tags must be strings';
    END IF;
    
    tag_text := tags->>i;
    
    -- Trim whitespace and convert to lowercase
    trimmed_tag := trim(lower(tag_text));
    
    -- Validate tag length (1-50 characters)
    IF length(trimmed_tag) = 0 THEN
      RAISE EXCEPTION 'Tags cannot be empty or contain only whitespace';
    END IF;
    
    IF length(trimmed_tag) > 50 THEN
      RAISE EXCEPTION 'Tags cannot exceed 50 characters';
    END IF;
    
    -- Validate tag format (alphanumeric, hyphens, underscores only)
    IF NOT trimmed_tag ~ '^[a-z0-9_-]+$' THEN
      RAISE EXCEPTION 'Tags can only contain lowercase letters, numbers, hyphens, and underscores';
    END IF;
    
    -- Add to normalized array if not already present (deduplicate)
    IF NOT normalized_tags ? trimmed_tag THEN
      normalized_tags := normalized_tags || to_jsonb(trimmed_tag);
    END IF;
  END LOOP;

  RETURN normalized_tags;
END;
$$ LANGUAGE plpgsql;

-- Simple validation function for check constraints
CREATE OR REPLACE FUNCTION validate_board_tags(tags jsonb)
RETURNS boolean AS $$
BEGIN
  -- Use the normalize function for validation, but catch exceptions
  BEGIN
    PERFORM validate_and_normalize_board_tags(tags);
    RETURN true;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;
END;
$$ LANGUAGE plpgsql;

-- Add constraint using the validation function
ALTER TABLE workspace_boards 
ADD CONSTRAINT workspace_boards_valid_tags 
CHECK (validate_board_tags(tags));

-- Helper function to add tags to a board (with automatic normalization)
CREATE OR REPLACE FUNCTION add_board_tags(board_id uuid, new_tags text[])
RETURNS jsonb AS $$
DECLARE
  current_tags jsonb;
  combined_tags jsonb;
  i integer;
BEGIN
  -- Get current tags
  SELECT tags INTO current_tags 
  FROM workspace_boards 
  WHERE id = board_id;

  IF current_tags IS NULL THEN
    RAISE EXCEPTION 'Board not found';
  END IF;

  -- Convert text array to jsonb array
  combined_tags := current_tags;
  FOR i IN 1..array_length(new_tags, 1) LOOP
    combined_tags := combined_tags || to_jsonb(new_tags[i]);
  END LOOP;

  -- Normalize and validate
  combined_tags := validate_and_normalize_board_tags(combined_tags);

  -- Update the board
  UPDATE workspace_boards 
  SET tags = combined_tags 
  WHERE id = board_id;

  RETURN combined_tags;
END;
$$ LANGUAGE plpgsql;

-- Helper function to remove tags from a board
CREATE OR REPLACE FUNCTION remove_board_tags(board_id uuid, tags_to_remove text[])
RETURNS jsonb AS $$
DECLARE
  current_tags jsonb;
  updated_tags jsonb := '[]'::jsonb;
  tag_value text;
  i integer;
  j integer;
  should_keep boolean;
BEGIN
  -- Get current tags
  SELECT tags INTO current_tags 
  FROM workspace_boards 
  WHERE id = board_id;

  IF current_tags IS NULL THEN
    RAISE EXCEPTION 'Board not found';
  END IF;

  -- Filter out tags to remove
  FOR i IN 0..jsonb_array_length(current_tags) - 1 LOOP
    tag_value := current_tags->>i;
    should_keep := true;

    -- Check if this tag should be removed
    FOR j IN 1..array_length(tags_to_remove, 1) LOOP
      IF lower(trim(tags_to_remove[j])) = tag_value THEN
        should_keep := false;
        EXIT;
      END IF;
    END LOOP;

    -- Keep the tag if it's not in the removal list
    IF should_keep THEN
      updated_tags := updated_tags || to_jsonb(tag_value);
    END IF;
  END LOOP;

  -- Update the board
  UPDATE workspace_boards 
  SET tags = updated_tags 
  WHERE id = board_id;

  RETURN updated_tags;
END;
$$ LANGUAGE plpgsql;

-- Helper function to search boards by tags
CREATE OR REPLACE FUNCTION search_boards_by_tags(
  workspace_id uuid, 
  search_tags text[], 
  match_all boolean DEFAULT false
)
RETURNS TABLE(board_id uuid, board_name text, board_tags jsonb) AS $$
BEGIN
  IF match_all THEN
    -- Return boards that have ALL specified tags
    RETURN QUERY
    SELECT wb.id, wb.name, wb.tags
    FROM workspace_boards wb
    WHERE wb.workspace_id = search_boards_by_tags.workspace_id
      AND wb.tags ?& search_tags;
  ELSE
    -- Return boards that have ANY of the specified tags
    RETURN QUERY
    SELECT wb.id, wb.name, wb.tags
    FROM workspace_boards wb
    WHERE wb.workspace_id = search_boards_by_tags.workspace_id
      AND wb.tags ?| search_tags;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically normalize tags on insert/update
CREATE OR REPLACE FUNCTION normalize_board_tags_trigger()
RETURNS trigger AS $$
BEGIN
  -- Only normalize if tags have changed or this is an insert
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.tags IS DISTINCT FROM OLD.tags) THEN
    NEW.tags := validate_and_normalize_board_tags(NEW.tags);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-normalize tags
CREATE TRIGGER normalize_board_tags_before_insert_update
  BEFORE INSERT OR UPDATE OF tags ON workspace_boards
  FOR EACH ROW
  EXECUTE FUNCTION normalize_board_tags_trigger(); 