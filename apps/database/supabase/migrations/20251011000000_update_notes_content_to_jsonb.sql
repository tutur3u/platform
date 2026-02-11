-- Migration: Update notes content from text to jsonb to support rich text editing
-- This allows notes to store TipTap JSONContent format for full text editor support

-- Step 1: Add a new temporary column for jsonb content
ALTER TABLE notes ADD COLUMN content_new jsonb;

-- Step 2: Migrate existing text content to jsonb format
-- Wrap existing plain text in a basic TipTap document structure
UPDATE notes
SET content_new = jsonb_build_object(
  'type', 'doc',
  'content', jsonb_build_array(
    jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'text',
          'text', content
        )
      )
    )
  )
)
WHERE content IS NOT NULL AND content != '';

-- Handle empty content
UPDATE notes
SET content_new = jsonb_build_object(
  'type', 'doc',
  'content', jsonb_build_array()
)
WHERE content IS NULL OR content = '';

-- Step 3: Drop the old content column
ALTER TABLE notes DROP COLUMN content;

-- Step 4: Rename the new column to content
ALTER TABLE notes RENAME COLUMN content_new TO content;

-- Step 5: Make content column required (NOT NULL)
ALTER TABLE notes ALTER COLUMN content SET NOT NULL;

-- Step 6: Add a check constraint to ensure valid jsonb structure
-- This ensures the content is a valid TipTap document
ALTER TABLE notes ADD CONSTRAINT notes_content_valid_json
  CHECK (
    content IS NOT NULL
    AND content ? 'type'
    AND (content->>'type') = 'doc'
  );

-- Add comment for documentation
COMMENT ON COLUMN notes.content IS 'TipTap JSONContent format for rich text editing';
