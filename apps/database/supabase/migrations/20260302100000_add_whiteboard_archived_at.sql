-- Add archived_at timestamp column to workspace_whiteboards
-- This migration adds archive tracking using timestamp instead of boolean

-- Step 1: Add archived_at column
ALTER TABLE workspace_whiteboards
ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NULL;

-- Step 2: Create index on archived_at for efficient filtering of non-archived boards
CREATE INDEX idx_workspace_whiteboards_archived_at ON workspace_whiteboards(archived_at) WHERE archived_at IS NULL;

-- Step 3: Add comment explaining the field
COMMENT ON COLUMN workspace_whiteboards.archived_at IS 'Timestamp when the whiteboard was archived. NULL means the whiteboard is active (not archived).';
