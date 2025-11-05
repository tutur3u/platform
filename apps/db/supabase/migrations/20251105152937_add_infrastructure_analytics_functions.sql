-- Infrastructure Analytics RPC Functions
-- Optimized functions for comprehensive platform analytics

-- ============================================
-- ENGAGEMENT METRICS (DAU, WAU, MAU)
-- ============================================

-- Get Daily Active Users count
CREATE OR REPLACE FUNCTION public.get_dau_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)
  FROM auth.sessions
  WHERE updated_at >= CURRENT_DATE;
$$;

-- Get Weekly Active Users count
CREATE OR REPLACE FUNCTION public.get_wau_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)
  FROM auth.sessions
  WHERE updated_at >= CURRENT_DATE - INTERVAL '7 days';
$$;

-- Get Monthly Active Users count
CREATE OR REPLACE FUNCTION public.get_mau_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)
  FROM auth.sessions
  WHERE updated_at >= CURRENT_DATE - INTERVAL '30 days';
$$;

-- Get engagement metrics over time (last N days)
CREATE OR REPLACE FUNCTION public.get_engagement_metrics_over_time(days integer DEFAULT 90)
RETURNS TABLE (
  date date,
  dau bigint,
  wau bigint,
  mau bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (days || ' days')::interval,
      CURRENT_DATE,
      '1 day'::interval
    )::date AS date
  ),
  daily_active AS (
    SELECT
      DATE(updated_at) AS activity_date,
      COUNT(DISTINCT user_id) AS active_users
    FROM auth.sessions
    WHERE updated_at >= CURRENT_DATE - (days || ' days')::interval
    GROUP BY DATE(updated_at)
  )
  SELECT
    ds.date,
    COALESCE(da.active_users, 0) AS dau,
    COALESCE(
      (SELECT COUNT(DISTINCT s.user_id)
       FROM auth.sessions s
       WHERE s.updated_at >= ds.date - INTERVAL '7 days'
       AND s.updated_at < ds.date + INTERVAL '1 day'),
      0
    ) AS wau,
    COALESCE(
      (SELECT COUNT(DISTINCT s.user_id)
       FROM auth.sessions s
       WHERE s.updated_at >= ds.date - INTERVAL '30 days'
       AND s.updated_at < ds.date + INTERVAL '1 day'),
      0
    ) AS mau
  FROM date_series ds
  LEFT JOIN daily_active da ON ds.date = da.activity_date
  ORDER BY ds.date;
END;
$$;

-- ============================================
-- SESSION ANALYTICS
-- ============================================

-- Get active sessions count
CREATE OR REPLACE FUNCTION public.get_active_sessions_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM auth.sessions
  WHERE not_after IS NULL OR not_after > NOW();
$$;

-- Get auth session statistics
CREATE OR REPLACE FUNCTION public.get_auth_session_statistics()
RETURNS TABLE (
  total_sessions bigint,
  active_sessions bigint,
  avg_session_duration_hours numeric,
  median_session_duration_minutes numeric,
  sessions_today bigint,
  sessions_this_week bigint,
  sessions_this_month bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) AS total_sessions,
    COUNT(*) FILTER (WHERE not_after IS NULL OR not_after > NOW()) AS active_sessions,
    ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(not_after, NOW()) - created_at)) / 3600)::numeric, 2) AS avg_session_duration_hours,
    ROUND(((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (COALESCE(not_after, NOW()) - created_at))))) / 60)::numeric, 2) AS median_session_duration_minutes,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS sessions_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS sessions_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS sessions_this_month
  FROM auth.sessions;
$$;

-- Get sessions by user agent (device type)
CREATE OR REPLACE FUNCTION public.get_sessions_by_device()
RETURNS TABLE (
  device_type text,
  session_count bigint,
  percentage numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH device_counts AS (
    SELECT
      CASE
        WHEN user_agent ILIKE '%mobile%' OR user_agent ILIKE '%android%' OR user_agent ILIKE '%iphone%' THEN 'Mobile'
        WHEN user_agent ILIKE '%tablet%' OR user_agent ILIKE '%ipad%' THEN 'Tablet'
        WHEN user_agent ILIKE '%bot%' OR user_agent ILIKE '%crawler%' THEN 'Bot'
        WHEN user_agent IS NULL THEN 'Unknown'
        ELSE 'Desktop'
      END AS device_type,
      COUNT(*) AS session_count
    FROM auth.sessions
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY 1
  ),
  total AS (
    SELECT SUM(session_count) AS total_count FROM device_counts
  )
  SELECT
    dc.device_type,
    dc.session_count,
    ROUND((dc.session_count::numeric / t.total_count::numeric * 100), 2) AS percentage
  FROM device_counts dc, total t
  ORDER BY dc.session_count DESC;
$$;

-- ============================================
-- AUTH PROVIDER ANALYTICS
-- ============================================

-- Get auth provider statistics
CREATE OR REPLACE FUNCTION public.get_auth_provider_stats()
RETURNS TABLE (
  provider text,
  user_count bigint,
  percentage numeric,
  last_sign_in_avg interval
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH provider_counts AS (
    SELECT
      i.provider,
      COUNT(DISTINCT i.user_id) AS user_count,
      AVG(NOW() - i.last_sign_in_at) AS avg_time_since_last_sign_in
    FROM auth.identities i
    GROUP BY i.provider
  ),
  total AS (
    SELECT COUNT(DISTINCT user_id) AS total_users FROM auth.identities
  )
  SELECT
    pc.provider,
    pc.user_count,
    ROUND((pc.user_count::numeric / t.total_users::numeric * 100), 2) AS percentage,
    pc.avg_time_since_last_sign_in AS last_sign_in_avg
  FROM provider_counts pc, total t
  ORDER BY pc.user_count DESC;
$$;

-- Get sign-ins by provider over time
CREATE OR REPLACE FUNCTION public.get_sign_ins_by_provider(days integer DEFAULT 30)
RETURNS TABLE (
  date date,
  provider text,
  sign_in_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    DATE(i.last_sign_in_at) AS date,
    i.provider,
    COUNT(*) AS sign_in_count
  FROM auth.identities i
  WHERE i.last_sign_in_at >= CURRENT_DATE - (days || ' days')::interval
  GROUP BY DATE(i.last_sign_in_at), i.provider
  ORDER BY date DESC, sign_in_count DESC;
$$;

-- ============================================
-- USER GROWTH ANALYTICS
-- ============================================

-- Get user growth statistics
CREATE OR REPLACE FUNCTION public.get_user_growth_stats(time_period text DEFAULT 'daily')
RETURNS TABLE (
  period text,
  new_users bigint,
  cumulative_users bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_registrations AS (
    SELECT
      created_at,
      ROW_NUMBER() OVER (ORDER BY created_at) AS cumulative_count
    FROM public.users
    WHERE created_at IS NOT NULL
  )
  SELECT
    CASE
      WHEN time_period = 'daily' THEN TO_CHAR(DATE(created_at), 'YYYY-MM-DD')
      WHEN time_period = 'weekly' THEN TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD')
      WHEN time_period = 'monthly' THEN TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM-DD')
      ELSE TO_CHAR(DATE(created_at), 'YYYY-MM-DD')
    END AS period,
    COUNT(*)::bigint AS new_users,
    MAX(cumulative_count)::bigint AS cumulative_users
  FROM user_registrations
  GROUP BY 1
  ORDER BY period;
END;
$$;

-- Get user growth comparison (current vs previous period)
CREATE OR REPLACE FUNCTION public.get_user_growth_comparison()
RETURNS TABLE (
  total_users bigint,
  users_today bigint,
  users_this_week bigint,
  users_this_month bigint,
  growth_rate_weekly numeric,
  growth_rate_monthly numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT
      COUNT(*) AS total_users,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS users_today,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS users_this_week,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS users_this_month,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' AND created_at < CURRENT_DATE - INTERVAL '7 days') AS users_prev_week,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '60 days' AND created_at < CURRENT_DATE - INTERVAL '30 days') AS users_prev_month
    FROM public.users
  )
  SELECT
    total_users,
    users_today,
    users_this_week,
    users_this_month,
    CASE
      WHEN users_prev_week > 0 THEN ROUND(((users_this_week::numeric - users_prev_week::numeric) / users_prev_week::numeric * 100), 2)
      ELSE NULL
    END AS growth_rate_weekly,
    CASE
      WHEN users_prev_month > 0 THEN ROUND(((users_this_month::numeric - users_prev_month::numeric) / users_prev_month::numeric * 100), 2)
      ELSE NULL
    END AS growth_rate_monthly
  FROM counts;
$$;

-- ============================================
-- WORKSPACE ANALYTICS
-- ============================================

-- Get workspace statistics
CREATE OR REPLACE FUNCTION public.get_workspace_statistics()
RETURNS TABLE (
  total_workspaces bigint,
  active_workspaces bigint,
  avg_members_per_workspace numeric,
  median_members_per_workspace numeric,
  empty_workspace_count bigint,
  workspaces_created_today bigint,
  workspaces_created_this_week bigint,
  workspaces_created_this_month bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_workspaces_with_members AS (
    SELECT
      w.id,
      COUNT(DISTINCT wm.user_id) as member_count
    FROM public.workspaces w
    LEFT JOIN public.workspace_members wm ON w.id = wm.ws_id
    WHERE w.deleted = false
    GROUP BY w.id
  ),
  workspace_creation_stats AS (
      SELECT
        COUNT(*) AS total_workspaces,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS workspaces_created_today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS workspaces_created_this_week,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS workspaces_created_this_month
      FROM public.workspaces
  )
  SELECT
    wcs.total_workspaces,
    (SELECT COUNT(*) FROM active_workspaces_with_members) AS active_workspaces,
    ROUND(AVG(awm.member_count), 2) AS avg_members_per_workspace,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY awm.member_count) AS median_members_per_workspace,
    COUNT(*) FILTER (WHERE awm.member_count = 0) AS empty_workspace_count,
    wcs.workspaces_created_today,
    wcs.workspaces_created_this_week,
    wcs.workspaces_created_this_month
  FROM active_workspaces_with_members awm, workspace_creation_stats wcs
  GROUP BY wcs.total_workspaces, wcs.workspaces_created_today, wcs.workspaces_created_this_week, wcs.workspaces_created_this_month;
$$;

-- Get workspace distribution by member count
CREATE OR REPLACE FUNCTION public.get_workspace_member_distribution()
RETURNS TABLE (
  member_range text,
  workspace_count bigint,
  percentage numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH member_counts AS (
    SELECT
      w.id,
      COUNT(DISTINCT wm.user_id) AS member_count
    FROM public.workspaces w
    LEFT JOIN public.workspace_members wm ON w.id = wm.ws_id
    WHERE w.deleted = false
    GROUP BY w.id
  ),
  grouped_counts AS (
    SELECT
      CASE
        WHEN member_count = 0 THEN '0 members'
        WHEN member_count = 1 THEN '1 member'
        WHEN member_count BETWEEN 2 AND 5 THEN '2-5 members'
        WHEN member_count BETWEEN 6 AND 10 THEN '6-10 members'
        WHEN member_count BETWEEN 11 AND 25 THEN '11-25 members'
        WHEN member_count BETWEEN 26 AND 50 THEN '26-50 members'
        ELSE '50+ members'
      END AS member_range,
      COUNT(*) AS workspace_count
    FROM member_counts
    GROUP BY 1
  ),
  total AS (
      SELECT SUM(workspace_count) as total_workspaces FROM grouped_counts
  )
  SELECT
    gc.member_range,
    gc.workspace_count,
    ROUND((gc.workspace_count::numeric / t.total_workspaces::numeric * 100), 2) AS percentage
  FROM grouped_counts gc, total t
  ORDER BY
    CASE
      WHEN gc.member_range = '0 members' THEN 0
      WHEN gc.member_range = '1 member' THEN 1
      WHEN gc.member_range = '2-5 members' THEN 2
      WHEN gc.member_range = '6-10 members' THEN 3
      WHEN gc.member_range = '11-25 members' THEN 4
      WHEN gc.member_range = '26-50 members' THEN 5
      ELSE 6
    END;
$$;

-- ============================================
-- AUDIT LOG ANALYTICS
-- ============================================

-- Get recent actions summary
CREATE OR REPLACE FUNCTION public.get_recent_actions_summary(limit_count integer DEFAULT 100)
RETURNS TABLE (
  action text,
  action_count bigint,
  last_occurrence timestamp with time zone,
  unique_users bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    payload->>'action' AS action,
    COUNT(*) AS action_count,
    MAX(created_at) AS last_occurrence,
    COUNT(DISTINCT (payload->>'actor_id')::uuid) AS unique_users
  FROM auth.audit_log_entries
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND payload->>'action' IS NOT NULL
  GROUP BY payload->>'action'
  ORDER BY action_count DESC
  LIMIT limit_count;
$$;

-- Get action frequency by time period
CREATE OR REPLACE FUNCTION public.get_action_frequency_by_hour()
RETURNS TABLE (
  hour_of_day integer,
  action_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(HOUR FROM created_at)::integer AS hour_of_day,
    COUNT(*) AS action_count
  FROM auth.audit_log_entries
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY EXTRACT(HOUR FROM created_at)
  ORDER BY hour_of_day;
$$;

-- Get recent audit log entries with details
CREATE OR REPLACE FUNCTION public.get_recent_audit_logs(limit_count integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  action text,
  actor_id uuid,
  actor_username text,
  log_type text,
  created_at timestamp with time zone,
  ip_address varchar(64)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    payload->>'action' AS action,
    (payload->>'actor_id')::uuid AS actor_id,
    payload->>'actor_username' AS actor_username,
    payload->>'log_type' AS log_type,
    created_at,
    ip_address
  FROM auth.audit_log_entries
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
  ORDER BY created_at DESC
  LIMIT limit_count;
$$;

-- ============================================
-- USER ACTIVITY & COHORT ANALYTICS
-- ============================================

-- Get user activity cohorts (lifecycle segments)
CREATE OR REPLACE FUNCTION public.get_user_activity_cohorts()
RETURNS TABLE (
  cohort_name text,
  user_count bigint,
  percentage numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_activity AS (
    SELECT
      u.id,
      u.created_at AS signup_date,
      MAX(s.updated_at) AS last_active
    FROM public.users u
    LEFT JOIN auth.sessions s ON u.id = s.user_id
    GROUP BY u.id, u.created_at
  ),
  cohorts AS (
    SELECT
      CASE
        WHEN signup_date >= CURRENT_DATE - INTERVAL '7 days' THEN 'New Users (< 7 days)'
        WHEN last_active >= CURRENT_DATE - INTERVAL '7 days' THEN 'Active (< 7 days)'
        WHEN last_active >= CURRENT_DATE - INTERVAL '30 days' THEN 'Casual (7-30 days)'
        WHEN last_active >= CURRENT_DATE - INTERVAL '90 days' THEN 'At Risk (30-90 days)'
        WHEN last_active IS NULL THEN 'Never Logged In'
        ELSE 'Churned (> 90 days)'
      END AS cohort_name,
      COUNT(*) AS user_count
    FROM user_activity
    GROUP BY 1
  ),
  total AS (
    SELECT SUM(user_count) AS total_users FROM cohorts
  )
  SELECT
    c.cohort_name,
    c.user_count,
    ROUND((c.user_count::numeric / t.total_users::numeric * 100), 2) AS percentage
  FROM cohorts c, total t
  ORDER BY c.user_count DESC;
$$;

-- Get retention rate by period
CREATE OR REPLACE FUNCTION public.get_retention_rate(period text DEFAULT 'weekly')
RETURNS TABLE (
  cohort_period text,
  cohort_size bigint,
  retained_users bigint,
  retention_rate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period_interval interval;
  trunc_string text;
BEGIN
  -- Set period based on input
  IF period = 'daily' THEN
    period_interval := '1 day'::interval;
    trunc_string := 'day';
  ELSIF period = 'weekly' THEN
    period_interval := '7 days'::interval;
    trunc_string := 'week';
  ELSE
    period_interval := '30 days'::interval;
    trunc_string := 'month';
  END IF;

  RETURN QUERY
  WITH cohorts AS (
    SELECT
      DATE_TRUNC(trunc_string, created_at) AS cohort_period_ts,
      id AS user_id
    FROM public.users
    WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
  ),
  cohort_sizes AS (
    SELECT
      cohort_period_ts,
      COUNT(*) AS cohort_size
    FROM cohorts
    GROUP BY cohort_period_ts
  ),
  retained AS (
    SELECT
      c.cohort_period_ts,
      COUNT(DISTINCT s.user_id) AS retained_users
    FROM cohorts c
    INNER JOIN auth.sessions s ON c.user_id = s.user_id
    WHERE s.created_at >= c.cohort_period_ts + period_interval
    AND s.created_at < c.cohort_period_ts + (period_interval * 2)
    GROUP BY c.cohort_period_ts
  )
  SELECT
    TO_CHAR(cs.cohort_period_ts, 'YYYY-MM-DD'),
    cs.cohort_size,
    COALESCE(r.retained_users, 0),
    CASE
      WHEN cs.cohort_size > 0 THEN ROUND((COALESCE(r.retained_users, 0)::numeric / cs.cohort_size::numeric * 100), 2)
      ELSE 0
    END
  FROM cohort_sizes cs
  LEFT JOIN retained r ON cs.cohort_period_ts = r.cohort_period_ts
  ORDER BY cs.cohort_period_ts DESC;
END;
$$;

-- ============================================
-- ACTIVITY HEATMAP DATA
-- ============================================

-- Get user activity by day of week and hour
CREATE OR REPLACE FUNCTION public.get_activity_heatmap()
RETURNS TABLE (
  day_of_week integer,
  hour_of_day integer,
  activity_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(DOW FROM updated_at)::integer AS day_of_week,
    EXTRACT(HOUR FROM updated_at)::integer AS hour_of_day,
    COUNT(*) AS activity_count
  FROM auth.sessions
  WHERE updated_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY EXTRACT(DOW FROM updated_at), EXTRACT(HOUR FROM updated_at)
  ORDER BY day_of_week, hour_of_day;
$$;

-- ============================================
-- USER INSIGHTS
-- ============================================

-- Get power users (top 10% by activity)
CREATE OR REPLACE FUNCTION public.get_power_users(limit_count integer DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  username text,
  action_count bigint,
  last_seen timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_activity AS (
    SELECT
      (payload->>'actor_id')::uuid as user_id,
      COUNT(*) as action_count,
      MAX(created_at) as last_seen
    FROM auth.audit_log_entries
    WHERE created_at >= NOW() - INTERVAL '30 days'
    AND (payload->>'actor_id') IS NOT NULL
    GROUP BY 1
  ),
  ranked_users AS (
    SELECT
      user_id,
      action_count,
      last_seen,
      NTILE(100) OVER (ORDER BY action_count DESC) as percentile
    FROM user_activity
  )
  SELECT
    ru.user_id,
    u.raw_user_meta_data->>'name' as username,
    ru.action_count,
    ru.last_seen
  FROM ranked_users ru
  JOIN auth.users u ON ru.user_id = u.id
  WHERE ru.percentile <= 10 -- Top 10%
  ORDER BY ru.action_count DESC
  LIMIT limit_count;
$$;

-- ============================================
-- FEATURE ADOPTION
-- ============================================

-- Get feature adoption statistics
CREATE OR REPLACE FUNCTION public.get_feature_adoption(feature_action_prefix text)
RETURNS TABLE (
    feature_name text,
    adoption_count bigint,
    adoption_percentage numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH feature_actions AS (
        SELECT DISTINCT
            payload->>'action' as action_name,
            (payload->>'actor_id')::uuid as user_id
        FROM auth.audit_log_entries
        WHERE payload->>'action' LIKE feature_action_prefix || '%'
    ),
    feature_usage AS (
        SELECT
            action_name,
            COUNT(DISTINCT user_id) as adoption_count
        FROM feature_actions
        GROUP BY action_name
    ),
    total_users AS (
        SELECT COUNT(DISTINCT id) as total_user_count FROM public.users
    )
    SELECT
        fu.action_name as feature_name,
        fu.adoption_count,
        ROUND((fu.adoption_count::numeric / tu.total_user_count * 100), 2) as adoption_percentage
    FROM feature_usage fu, total_users tu
    ORDER BY fu.adoption_count DESC;
$$;


-- Create indexes for better performance on public schema tables only
-- Note: auth schema tables are managed by Supabase and we cannot create indexes on them
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspaces_created_at ON public.workspaces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_members_ws_id ON public.workspace_members(ws_id);

COMMENT ON FUNCTION public.get_dau_count IS 'Returns Daily Active Users count';
COMMENT ON FUNCTION public.get_wau_count IS 'Returns Weekly Active Users count';
COMMENT ON FUNCTION public.get_mau_count IS 'Returns Monthly Active Users count';
COMMENT ON FUNCTION public.get_active_sessions_count IS 'Returns count of currently active sessions';
COMMENT ON FUNCTION public.get_auth_session_statistics IS 'Returns comprehensive auth session statistics, including median duration.';
COMMENT ON FUNCTION public.get_auth_provider_stats IS 'Returns statistics grouped by authentication provider';
COMMENT ON FUNCTION public.get_user_growth_stats IS 'Returns user growth statistics by time period';
COMMENT ON FUNCTION public.get_workspace_statistics IS 'Returns comprehensive workspace statistics, including median member count and empty workspace count.';
COMMENT ON FUNCTION public.get_recent_actions_summary IS 'Returns summary of recent platform actions from audit logs';
COMMENT ON FUNCTION public.get_user_activity_cohorts IS 'Returns user lifecycle cohort distribution';
COMMENT ON FUNCTION public.get_retention_rate IS 'Returns retention rate analysis by period';
COMMENT ON FUNCTION public.get_power_users IS 'Identifies top 10% of users by activity in the last 30 days.';
COMMENT ON FUNCTION public.get_feature_adoption IS 'Calculates the adoption rate of features based on audit log actions.';

