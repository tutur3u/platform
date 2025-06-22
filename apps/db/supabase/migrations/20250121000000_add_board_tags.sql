-- Add tags column to workspace_boards table
-- Tags will be stored as a JSONB array of strings for flexibility and performance
ALTER TABLE workspace_boards 
ADD COLUMN tags JSONB DEFAULT '[]'::jsonb;

-- Create index for better performance when filtering by tags
CREATE INDEX idx_workspace_boards_tags ON workspace_boards USING gin(tags);

-- Add check constraint to ensure tags is always an array
ALTER TABLE workspace_boards 
ADD CONSTRAINT workspace_boards_tags_is_array 
CHECK (jsonb_typeof(tags) = 'array');

-- Function to validate tag format (optional but recommended)
CREATE OR REPLACE FUNCTION validate_board_tags(tags jsonb)
RETURNS boolean AS $$
BEGIN
  -- Check if tags is an array
  IF jsonb_typeof(tags) != 'array' THEN
    RETURN false;
  END IF;
  
  -- Check if all elements are strings and not empty
  FOR i IN 0..jsonb_array_length(tags) - 1 LOOP
    IF jsonb_typeof(tags->i) != 'string' OR length(tags->>i) = 0 THEN
      RETURN false;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Add constraint using the validation function
ALTER TABLE workspace_boards 
ADD CONSTRAINT workspace_boards_valid_tags 
CHECK (validate_board_tags(tags)); 