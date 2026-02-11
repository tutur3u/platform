-- Rename background_url to background_path and convert existing URLs to storage paths
-- Public URLs format: https://<project>.supabase.co/storage/v1/object/public/workspaces/<path>
-- We need to extract: <path> (everything after 'workspaces/')

-- Step 1: Add new column
ALTER TABLE board_templates ADD COLUMN IF NOT EXISTS background_path TEXT;

-- Step 2: Migrate data - extract path from public URL or set to NULL
-- Pattern: .../storage/v1/object/public/workspaces/...
-- We extract everything after 'workspaces/'
UPDATE board_templates
SET background_path = CASE
  -- If it's a public URL, extract the path after 'workspaces/'
  WHEN background_url LIKE '%/storage/v1/object/public/workspaces/%' THEN
    SUBSTRING(background_url FROM '/storage/v1/object/public/workspaces/(.+)$')
  -- If it's already a path (no http), keep it
  WHEN background_url IS NOT NULL AND background_url NOT LIKE 'http%' THEN
    background_url
  -- Otherwise (signed URLs, unknown formats), set to NULL (safe to lose)
  ELSE NULL
END
WHERE background_url IS NOT NULL;

-- Step 3: Drop the old column
ALTER TABLE board_templates DROP COLUMN IF EXISTS background_url;

-- Add comment for documentation
COMMENT ON COLUMN board_templates.background_path IS 'Storage path for template background image (relative to workspaces bucket)';
