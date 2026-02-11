-- Create materialized view for Posts dashboard with denormalized data
-- This significantly improves query performance by pre-joining all related tables
-- Note: pg_cron extension must be enabled (already available in Supabase)

CREATE MATERIALIZED VIEW IF NOT EXISTS posts_dashboard_view AS
SELECT
  ugpc.post_id,
  ugpc.user_id,
  ugpc.email_id,
  ugpc.is_completed,
  ugpc.notes,
  ugpc.created_at,

  -- Workspace user fields
  wu.ws_id,
  wu.email as user_email,
  wu.display_name,
  wu.full_name,

  -- Post fields
  ugp.id as post_id_full,
  ugp.title as post_title,
  ugp.content as post_content,
  ugp.created_at as post_created_at,

  -- Group fields
  wug.id as group_id,
  wug.name as group_name,

  -- Sent email fields
  se.subject as email_subject,
  se.created_at as email_sent_at,

  -- Computed fields for easier querying
  COALESCE(wu.full_name, wu.display_name) as recipient
FROM
  public.user_group_post_checks ugpc
  INNER JOIN public.workspace_users wu ON wu.id = ugpc.user_id
  INNER JOIN public.user_group_posts ugp ON ugp.id = ugpc.post_id
  LEFT JOIN public.workspace_user_groups wug ON wug.id = ugp.group_id
  LEFT JOIN public.sent_emails se ON se.id = ugpc.email_id
WHERE
  -- Exclude internal emails (optimization for common filter)
  wu.email NOT ILIKE '%@easy%';

-- Create indexes on the materialized view for optimal query performance

-- Unique index required for CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS posts_dashboard_view_post_user_idx
  ON posts_dashboard_view (post_id, user_id);

CREATE INDEX IF NOT EXISTS posts_dashboard_view_ws_id_idx
  ON posts_dashboard_view (ws_id);

CREATE INDEX IF NOT EXISTS posts_dashboard_view_created_at_idx
  ON posts_dashboard_view (created_at DESC);

CREATE INDEX IF NOT EXISTS posts_dashboard_view_user_id_idx
  ON posts_dashboard_view (user_id);

CREATE INDEX IF NOT EXISTS posts_dashboard_view_group_id_idx
  ON posts_dashboard_view (group_id);

CREATE INDEX IF NOT EXISTS posts_dashboard_view_email_id_idx
  ON posts_dashboard_view (email_id);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS posts_dashboard_view_ws_id_created_at_idx
  ON posts_dashboard_view (ws_id, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_dashboard_view_ws_id_user_id_idx
  ON posts_dashboard_view (ws_id, user_id);

CREATE INDEX IF NOT EXISTS posts_dashboard_view_ws_id_group_id_idx
  ON posts_dashboard_view (ws_id, group_id);

-- Create a function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_posts_dashboard_view()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY posts_dashboard_view;
END;
$$;

-- Grant necessary permissions
GRANT SELECT ON posts_dashboard_view TO authenticated;
GRANT SELECT ON posts_dashboard_view TO anon;
GRANT EXECUTE ON FUNCTION refresh_posts_dashboard_view() TO service_role;

-- Add comment for documentation
COMMENT ON MATERIALIZED VIEW posts_dashboard_view IS
  'Denormalized view for Posts dashboard with pre-joined data.
   Refresh using: SELECT refresh_posts_dashboard_view();
   Recommended refresh schedule: Every 5-15 minutes via cron job or trigger.';

-- Optional: Create a trigger-based refresh on data changes
-- Note: This can impact write performance, so consider using cron jobs instead

CREATE OR REPLACE FUNCTION trigger_refresh_posts_dashboard_view()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use pg_notify to signal that a refresh is needed
  -- A background worker can listen and batch refresh requests
  PERFORM pg_notify('posts_dashboard_refresh', 'refresh_needed');
  RETURN NEW;
END;
$$;

-- Triggers for automatic refresh (uncomment if using trigger-based refresh)
-- Note: Triggers can impact write performance, so consider using cron jobs instead
--
-- CREATE TRIGGER posts_dashboard_refresh_on_post_checks
--   AFTER INSERT OR UPDATE OR DELETE ON user_group_post_checks
--   FOR EACH STATEMENT
--   EXECUTE FUNCTION trigger_refresh_posts_dashboard_view();
--
-- CREATE TRIGGER posts_dashboard_refresh_on_posts
--   AFTER INSERT OR UPDATE OR DELETE ON user_group_posts
--   FOR EACH STATEMENT
--   EXECUTE FUNCTION trigger_refresh_posts_dashboard_view();
--
-- CREATE TRIGGER posts_dashboard_refresh_on_sent_emails
--   AFTER INSERT OR UPDATE OR DELETE ON sent_emails
--   FOR EACH STATEMENT
--   EXECUTE FUNCTION trigger_refresh_posts_dashboard_view();

-- Use pg_cron extension for scheduled refreshes
-- Refreshes the materialized view every 10 minutes
SELECT cron.schedule(
  'refresh-posts-dashboard',
  '*/10 * * * *',
  $$SELECT refresh_posts_dashboard_view();$$
);
