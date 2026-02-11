CREATE OR REPLACE FUNCTION public.get_session_statistics()
RETURNS TABLE (
  total_count bigint,
  unique_users_count bigint,
  active_count bigint,
  completed_count bigint,
  latest_session_date timestamp with time zone
) LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*)::bigint as total_count,
    COUNT(DISTINCT user_id)::bigint as unique_users_count,
    COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::bigint as active_count,
    COUNT(*) FILTER (WHERE status = 'ENDED')::bigint as completed_count,
    MAX(start_time) as latest_session_date
  FROM nova_sessions;
$$; 