-- Create a stored procedure to hard delete soft-deleted items
CREATE OR REPLACE FUNCTION hard_delete_soft_deleted_items()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hard delete tasks that were soft-deleted more than 30 days ago
  DELETE FROM public.tasks
  WHERE deleted_at IS NOT NULL
  AND deleted_at < (now() - interval '30 days');

  -- Hard delete boards that were soft-deleted more than 30 days ago
  DELETE FROM public.workspace_boards
  WHERE deleted_at IS NOT NULL
  AND deleted_at < (now() - interval '30 days');
END;
$$;

-- Schedule the hard delete job to run every hour at 5 minutes past the hour
SELECT cron.schedule(
  'hard-delete-soft-deleted-items',
  '5 * * * *',
  'SELECT hard_delete_soft_deleted_items();'
);

-- Grant execute permission to authenticated users (for manual execution if needed)
GRANT EXECUTE ON FUNCTION hard_delete_soft_deleted_items() TO authenticated;

-- Add comment to document the function
COMMENT ON FUNCTION hard_delete_soft_deleted_items() IS
  'Hard deletes tasks and boards that were soft-deleted more than 30 days ago. Runs hourly via pg_cron.';
