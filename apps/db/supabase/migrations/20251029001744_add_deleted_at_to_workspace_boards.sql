-- Add deleted_at timestamp field to workspace_boards table
-- This migration adds soft delete capability to workspace boards using timestamp instead of boolean

-- Step 1: Add deleted_at column
ALTER TABLE workspace_boards
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Step 2: Migrate existing deleted=true records to have deleted_at timestamp
-- Use NOW() as the deletion timestamp since we don't have exact deletion time
UPDATE workspace_boards
SET deleted_at = NOW()
WHERE deleted = true;

-- Step 3: Create index on deleted_at for efficient filtering of non-deleted boards
CREATE INDEX idx_workspace_boards_deleted_at ON workspace_boards(deleted_at) WHERE deleted_at IS NULL;

-- Step 4: Add comment explaining the field
COMMENT ON COLUMN workspace_boards.deleted_at IS 'Timestamp when the board was soft deleted. NULL means the board is active.';

-- Migration is reversible:
-- To rollback: DROP INDEX idx_workspace_boards_deleted_at; ALTER TABLE workspace_boards DROP COLUMN deleted_at;