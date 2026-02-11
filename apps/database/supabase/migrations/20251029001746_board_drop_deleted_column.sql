-- Drop the deleted and archived boolean columns from workspace_boards
-- This completes the migration to timestamp-based soft delete/archive pattern
-- The deleted_at column was added in migration 20251023000000_add_deleted_at_to_workspace_boards.sql
-- The archived_at column was added in migration 20251024083014_board_archived_at.sql

-- Verify all data has been migrated (this should be a no-op if migrations ran correctly)
-- Just in case there's any edge case, ensure deleted=true rows have deleted_at
UPDATE workspace_boards
SET deleted_at = COALESCE(deleted_at, NOW())
WHERE deleted = true AND deleted_at IS NULL;

-- Ensure archived=true rows have archived_at
UPDATE workspace_boards
SET archived_at = COALESCE(archived_at, NOW())
WHERE archived = true AND archived_at IS NULL;

-- Now it's safe to drop the old boolean columns
ALTER TABLE workspace_boards DROP COLUMN IF EXISTS deleted;
ALTER TABLE workspace_boards DROP COLUMN IF EXISTS archived;

-- Migration is reversible (though not recommended):
-- To rollback:
-- ALTER TABLE workspace_boards ADD COLUMN deleted BOOLEAN DEFAULT false;
-- ALTER TABLE workspace_boards ADD COLUMN archived BOOLEAN DEFAULT false;
-- UPDATE workspace_boards SET deleted = (deleted_at IS NOT NULL);
-- UPDATE workspace_boards SET archived = (archived_at IS NOT NULL);
