-- Migrate task completion and archival tracking from boolean to timestamp
-- This migration:
-- 1. Adds completed_at and closed_at timestamp columns
-- 2. Migrates archived (boolean) -> closed_at (timestamp)
-- 3. Migrates deleted (boolean) -> deleted_at (timestamp)
-- 4. Adds automatic triggers for setting timestamps

-- Step 1: Add new timestamp columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Step 2: Migrate existing archived tasks to closed_at
-- If archived = true, set closed_at to now() as we don't have historical data
UPDATE tasks
SET closed_at = NOW()
WHERE archived = TRUE AND closed_at IS NULL;

-- Step 3: Migrate existing deleted tasks to deleted_at
-- If deleted = true, set deleted_at to now() as we don't have historical data
UPDATE tasks
SET deleted_at = NOW()
WHERE deleted = TRUE AND deleted_at IS NULL;

-- Step 4: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS tasks_completed_at_idx ON tasks(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_closed_at_idx ON tasks(closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;

-- Step 5: Drop old boolean columns (after data migration)
ALTER TABLE tasks DROP COLUMN IF EXISTS archived;
ALTER TABLE tasks DROP COLUMN IF EXISTS deleted;

-- Step 6: Create function to automatically manage completed_at and closed_at
-- This function handles all timestamp logic based on task list status
CREATE OR REPLACE FUNCTION set_task_timestamps()
RETURNS TRIGGER AS $$
DECLARE
  new_list_status TEXT;
BEGIN
  -- Get the status of the new list
  IF NEW.list_id IS NOT NULL THEN
    SELECT status INTO new_list_status
    FROM task_lists
    WHERE id = NEW.list_id;

    -- Handle different list statuses
    CASE new_list_status
      WHEN 'done' THEN
        -- Task moved to done list: set completed_at, clear closed_at
        IF NEW.completed_at IS NULL THEN
          NEW.completed_at = NOW();
        END IF;
        NEW.closed_at = NULL;

      WHEN 'closed' THEN
        -- Task moved to closed list: set closed_at, clear completed_at
        IF NEW.closed_at IS NULL THEN
          NEW.closed_at = NOW();
        END IF;
        NEW.completed_at = NULL;

      WHEN 'active', 'not_started' THEN
        -- Task moved to active/not_started list: clear both timestamps
        NEW.completed_at = NULL;
        NEW.closed_at = NULL;

      ELSE
        -- Unknown status: clear both timestamps to be safe
        NEW.completed_at = NULL;
        NEW.closed_at = NULL;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Drop existing triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS task_completion_date_trigger ON tasks;
DROP TRIGGER IF EXISTS task_closed_date_trigger ON tasks;
DROP TRIGGER IF EXISTS task_completed_at_trigger ON tasks;
DROP TRIGGER IF EXISTS task_closed_at_trigger ON tasks;
DROP TRIGGER IF EXISTS task_timestamps_trigger ON tasks;

-- Step 8: Create trigger to manage timestamps
-- This single trigger handles both completed_at and closed_at
CREATE TRIGGER task_timestamps_trigger
  BEFORE INSERT OR UPDATE OF list_id ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_timestamps();

-- Step 9: Backfill completed_at for tasks in 'done' lists
-- (This handles tasks that were completed before this migration)
UPDATE tasks
SET completed_at = created_at
WHERE completed_at IS NULL
  AND list_id IN (
    SELECT id FROM task_lists WHERE status = 'done'
  );

-- Step 10: Backfill closed_at for tasks in 'closed' lists
-- (This handles tasks that were in closed lists before this migration)
UPDATE tasks
SET closed_at = COALESCE(closed_at, created_at)
WHERE list_id IN (
  SELECT id FROM task_lists WHERE status = 'closed'
);

-- Step 11: Add comments for documentation
COMMENT ON COLUMN tasks.completed_at IS 'Timestamp when the task was marked as completed (moved to a done list)';
COMMENT ON COLUMN tasks.closed_at IS 'Timestamp when the task was marked as closed (moved to a closed list)';
COMMENT ON COLUMN tasks.deleted_at IS 'Timestamp when the task was soft-deleted (null means not deleted)';
