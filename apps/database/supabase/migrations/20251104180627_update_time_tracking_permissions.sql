--
-- Update time tracking functions to use permission-based access control
--

CREATE OR REPLACE FUNCTION public.get_time_tracking_stats(
    p_ws_id uuid,
    p_user_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stats_data json;
    user_filter text := '';
BEGIN
    -- Check if user has access to the workspace
    IF NOT EXISTS (
        SELECT 1 FROM workspace_members wm 
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied: user is not a member of this workspace';
    END IF;
    
    -- If specific user requested, ensure it's either the current user or user has admin access
    IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
        IF NOT EXISTS (
            SELECT 1 FROM workspace_members wm 
            WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid() 
            AND public.has_workspace_permission(p_ws_id, auth.uid(), 'manage_workspace_members')
        ) THEN
            RAISE EXCEPTION 'Access denied: insufficient permissions to view other users data';
        END IF;
    END IF;
    -- Add user filter if specified
    IF p_user_id IS NOT NULL THEN
        user_filter := FORMAT(' AND user_id = ''%s''', p_user_id);
    END IF;
    
    -- Calculate comprehensive stats
    EXECUTE FORMAT(
        'WITH date_ranges AS (
            SELECT 
                CURRENT_DATE as today,
                DATE_TRUNC(''week'', CURRENT_DATE)::DATE as week_start,
                DATE_TRUNC(''month'', CURRENT_DATE)::DATE as month_start
        ),
        session_stats AS (
            SELECT 
                COUNT(*) as total_sessions,
                COUNT(CASE WHEN is_running THEN 1 END) as active_sessions,
                COUNT(DISTINCT user_id) as active_users,
                SUM(CASE WHEN date = dr.today THEN COALESCE(duration_seconds, 0) ELSE 0 END) as today_time,
                SUM(CASE WHEN date >= dr.week_start THEN COALESCE(duration_seconds, 0) ELSE 0 END) as week_time,
                SUM(CASE WHEN date >= dr.month_start THEN COALESCE(duration_seconds, 0) ELSE 0 END) as month_time,
                COUNT(CASE WHEN date = dr.today THEN 1 END) as today_sessions,
                COUNT(CASE WHEN date >= dr.week_start THEN 1 END) as week_sessions,
                COUNT(CASE WHEN date >= dr.month_start THEN 1 END) as month_sessions
            FROM time_tracking_sessions tts
            CROSS JOIN date_ranges dr
            WHERE tts.ws_id = ''%s''%s AND duration_seconds IS NOT NULL
        ),
        activity_streak AS (
            WITH daily_activity AS (
                SELECT date
                FROM time_tracking_sessions tts
                WHERE tts.ws_id = ''%s''%s AND duration_seconds IS NOT NULL
                GROUP BY date
                HAVING SUM(duration_seconds) > 0
                ORDER BY date DESC
            ),
            consecutive_days AS (
                SELECT date, 
                       ROW_NUMBER() OVER (ORDER BY date DESC) as rn,
                       date - (ROW_NUMBER() OVER (ORDER BY date DESC) * INTERVAL ''1 day'') as streak_group
                FROM daily_activity
                WHERE date <= CURRENT_DATE
            ),
            current_streak AS (
                SELECT COUNT(*) as days
                FROM consecutive_days
                WHERE streak_group = (
                    SELECT streak_group 
                    FROM consecutive_days 
                    WHERE date = CURRENT_DATE
                    LIMIT 1
                )
            )
            SELECT COALESCE(MAX(days), 0) as streak
            FROM current_streak
        )
        SELECT JSON_BUILD_OBJECT(
            ''total_sessions'', COALESCE(ss.total_sessions, 0),
            ''active_sessions'', COALESCE(ss.active_sessions, 0),
            ''active_users'', COALESCE(ss.active_users, 0),
            ''today_time'', COALESCE(ss.today_time, 0),
            ''week_time'', COALESCE(ss.week_time, 0),
            ''month_time'', COALESCE(ss.month_time, 0),
            ''today_sessions'', COALESCE(ss.today_sessions, 0),
            ''week_sessions'', COALESCE(ss.week_sessions, 0),
            ''month_sessions'', COALESCE(ss.month_sessions, 0),
            ''current_streak'', COALESCE(ast.streak, 0)
        ) as stats
        FROM session_stats ss
        CROSS JOIN activity_streak ast',
        p_ws_id, user_filter, p_ws_id, user_filter
    ) INTO stats_data;
    
    RETURN COALESCE(stats_data, '{}'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_time_tracking_daily_activity(
    p_ws_id uuid,
    p_days_back integer DEFAULT 30,
    p_user_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    activity_data json;
    user_filter text := '';
BEGIN
    -- Check if user has access to the workspace
    IF NOT EXISTS (
        SELECT 1 FROM workspace_members wm 
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied: user is not a member of this workspace';
    END IF;
    
    -- If specific user requested, ensure it's either the current user or user has admin access
    IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
        IF NOT EXISTS (
            SELECT 1 FROM workspace_members wm 
            WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid() 
            AND public.has_workspace_permission(p_ws_id, auth.uid(), 'manage_workspace_members')
        ) THEN
            RAISE EXCEPTION 'Access denied: insufficient permissions to view other users data';
        END IF;
    END IF;
    -- Add user filter if specified
    IF p_user_id IS NOT NULL THEN
        user_filter := FORMAT(' AND user_id = ''%s''', p_user_id);
    END IF;
    
    -- Get daily activity data
    EXECUTE FORMAT(
        'SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
                ''date'', date::TEXT,
                ''duration'', total_duration,
                ''sessions'', session_count,
                ''users'', unique_users
            ) ORDER BY date
        ) as activity
        FROM (
            SELECT 
                date,
                SUM(COALESCE(duration_seconds, 0)) as total_duration,
                COUNT(*) as session_count,
                COUNT(DISTINCT user_id) as unique_users
            FROM time_tracking_sessions
            WHERE ws_id = ''%s''%s 
                AND date >= CURRENT_DATE - INTERVAL ''%s days''
                AND duration_seconds IS NOT NULL
            GROUP BY date
            ORDER BY date
        ) daily_stats',
        p_ws_id, user_filter, p_days_back
    ) INTO activity_data;
    
    RETURN COALESCE(activity_data, '[]'::JSON);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_time_tracking_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_time_tracking_daily_activity TO authenticated;

