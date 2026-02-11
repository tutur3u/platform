-- Add archived_at timestamp column to workspace_boards
-- This migration adds archive tracking using timestamp instead of boolean

-- Step 1: Add archived_at column
ALTER TABLE workspace_boards
ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NULL;

-- Step 2: Migrate existing archived=true records to have archived_at timestamp
-- Use NOW() as the archived timestamp since we don't have exact archive time
UPDATE workspace_boards
SET archived_at = NOW()
WHERE archived = true;

-- Step 3: Create index on archived_at for efficient filtering of non-archived boards
CREATE INDEX idx_workspace_boards_archived_at ON workspace_boards(archived_at) WHERE archived_at IS NULL;

-- Step 4: Add comment explaining the field
COMMENT ON COLUMN workspace_boards.archived_at IS 'Timestamp when the board was archived. NULL means the board is active (not archived).';

-- Migration is reversible:
-- To rollback:
-- DROP INDEX idx_workspace_boards_archived_at;
-- ALTER TABLE workspace_boards DROP COLUMN archived_at;
