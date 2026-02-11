DROP FUNCTION IF EXISTS get_submission_statistics;

-- Add RPC function to get submission statistics
CREATE OR REPLACE FUNCTION get_submission_statistics()
RETURNS TABLE (
  total_count bigint,
  latest_submission_date timestamp with time zone,
  unique_users_count bigint
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM nova_submissions) as total_count,
    (SELECT created_at FROM nova_submissions ORDER BY created_at DESC LIMIT 1) as latest_submission_date,
    (SELECT COUNT(DISTINCT user_id) FROM nova_submissions WHERE user_id IS NOT NULL) as unique_users_count;
END;
$$;
