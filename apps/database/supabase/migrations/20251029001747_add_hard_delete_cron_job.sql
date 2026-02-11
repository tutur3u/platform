-- Description:
-- This migration introduces a cron job that automatically hard deletes records
-- (tasks, boards) that were soft-deleted more than 30 days ago.
-- While this is intended to free up database space and enforce data retention
-- policies, the hard delete operation is irreversible without proper backups.
--
-- =============================================================================
-- !! CRITICAL !! ROLLBACK AND RECOVERY STRATEGY
-- =============================================================================
--
-- This migration performs IRREVERSIBLE hard deletes. In case of accidental
-- data loss or if a rollback is needed, follow the procedures outlined below.
--
-- 1. Recommended Rollback Plan:
--    - Step 1: Immediately disable the cron job to prevent further data deletion.
--      See section 4 for instructions.
--    - Step 2: Restore the deleted rows from the last known good backup.
--      This requires access to the database's point-in-time recovery (PITR)
--      or regular backup snapshots.
--    - Step 3: Schedule the removal of this cron job in a future migration if
--      the hard delete policy is no longer desired.
--
-- 2. Operational Recovery Procedure:
--    - Source: Database backups (PITR or snapshots).
--    - Expected Time Range: Recovery time will depend on the size of the data to
--      be restored and the time it takes to access the backup. Plan for a window
--      of 1-3 hours for investigation and execution.
--    - Steps:
--      a. Identify the exact time the incorrect deletions occurred by querying
--         the cron job history or application logs.
--      b. Use the database provider's console/CLI to restore the database to a
--         point in time just before the deletions happened.
--      c. Alternatively, if PITR is not an option, restore the latest full backup
--         to a temporary database, then manually extract the deleted rows and
--         insert them back into the production database.
--
-- 3. Alternative Safer Approach (for future runs):
--    - Archive to a Shadow Table: Instead of a direct `DELETE`, move the rows
--      to an `archived_tasks` or `archived_boards` table. This keeps the data
--      restorable for a longer period without cluttering the main tables.
--    - Use a Retention Flag: Add a boolean flag like `ready_for_deletion`. The
--      cron job would first set this flag, and a second, less frequent job
--      would perform the final hard delete. This provides a grace period to
--      reverse the decision.
--
-- 4. How to Temporarily Disable the Cron Job:
--    - To disable the job without dropping it, you can unschedule it using the
--      following SQL command. This is the fastest way to halt deletions in an
--      emergency.
--
--      -- Connect to the database and run:
--      SELECT cron.unschedule('hard-delete-soft-deleted-items');
--
-- =============================================================================

-- Create a stored procedure to hard delete soft-deleted items
CREATE OR REPLACE FUNCTION hard_delete_soft_deleted_items()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hard delete tasks that were soft-deleted more than 30 days ago
  DELETE FROM public.tasks
  WHERE deleted_at IS NOT NULL
  AND deleted_at < (now() AT TIME ZONE 'UTC' - interval '30 days');

  -- Hard delete boards that were soft-deleted more than 30 days ago
  DELETE FROM public.workspace_boards
  WHERE deleted_at IS NOT NULL
  AND deleted_at < (now() AT TIME ZONE 'UTC' - interval '30 days');
END;
$$;

-- Schedule the hard delete job to run every hour at 5 minutes past the hour
SELECT cron.schedule(
  'hard-delete-soft-deleted-items',
  '5 * * * *',
  'SELECT hard_delete_soft_deleted_items();'
);

-- The function is executed by pg_cron, which runs with elevated privileges.
-- No explicit EXECUTE grant to other roles is necessary or desirable,
-- following the principle of least privilege.

-- Add comment to document the function
COMMENT ON FUNCTION hard_delete_soft_deleted_items() IS
  'Hard deletes tasks and boards that were soft-deleted more than 30 days ago. Runs hourly via pg_cron.';