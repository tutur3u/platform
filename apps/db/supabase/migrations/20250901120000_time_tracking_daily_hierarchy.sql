-- Time tracking pagination and analytics functions
-- These functions provide server-side aggregation and pagination for better performance

-- Function to get paginated time tracking sessions grouped by period and user
CREATE OR REPLACE FUNCTION get_time_tracking_sessions_paginated(
    p_ws_id UUID,
    p_period TEXT DEFAULT 'day', -- 'day', 'week', 'month'
    p_page INTEGER DEFAULT 1,
    p_limit INTEGER DEFAULT 50,
    p_search TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    offset_value INTEGER;
    total_count INTEGER;
    sessions_data JSON;
    period_key_expression TEXT;
    where_clause TEXT := '';
    search_clause TEXT := '';
BEGIN
    -- Set secure search path to prevent function hijacking
    PERFORM set_config('search_path', 'public, pg_temp', true);
    
    -- Validate input parameters
    IF p_page < 1 THEN
        RAISE EXCEPTION 'Page must be >= 1';
    END IF;
    IF p_limit <= 0 OR p_limit > 200 THEN
        RAISE EXCEPTION 'Limit must be between 1 and 200';
    END IF;
    IF p_period NOT IN ('day', 'week', 'month') THEN
        RAISE EXCEPTION 'Period must be one of: day, week, month';
    END IF;
    
    -- Check workspace membership authorization
    IF NOT EXISTS (
        SELECT 1 FROM workspace_members wm 
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied: not a member of this workspace';
    END IF;
    -- Calculate offset
    offset_value := (p_page - 1) * p_limit;
    
    -- Determine period key expression based on period type
    CASE p_period
        WHEN 'day' THEN
            period_key_expression := 'date';
        WHEN 'week' THEN
            -- Use ISO week starting Monday (standard PostgreSQL approach)
            period_key_expression := 'DATE_TRUNC(''week'', date)::DATE';
        WHEN 'month' THEN
            period_key_expression := 'DATE_TRUNC(''month'', date)::DATE';
        ELSE
            period_key_expression := 'date';
    END CASE;
    
    -- Build search clause if search term provided
    IF p_search IS NOT NULL AND LENGTH(p_search) > 0 THEN
        search_clause := ' AND (u.display_name ILIKE ' || quote_literal('%' || p_search || '%') || 
                        ' OR tts.title ILIKE ' || quote_literal('%' || p_search || '%') || 
                        ' OR ttc.name ILIKE ' || quote_literal('%' || p_search || '%') || ')';
    END IF;
    
    -- Build complete WHERE clause
    where_clause := FORMAT('WHERE tts.ws_id = ''%s''%s', p_ws_id, search_clause);
    
    -- Get total count for pagination metadata
    -- Using ROW constructor for better performance than string concatenation
    EXECUTE FORMAT(
        'SELECT COUNT(DISTINCT ROW((%s), tts.user_id)) 
         FROM time_tracking_sessions tts
         LEFT JOIN users u ON u.id = tts.user_id
         LEFT JOIN time_tracking_categories ttc ON ttc.id = tts.category_id
         %s',
        period_key_expression,
        where_clause
    ) INTO total_count;
    
    -- Get grouped sessions data
    EXECUTE FORMAT(
        'WITH grouped_sessions AS (
            SELECT 
                %s as period_key,
                tts.user_id,
                u.display_name,
                u.avatar_url,
                COUNT(tts.id) as session_count,
                SUM(COALESCE(tts.duration_seconds, 0)) as total_duration,
                MIN(tts.start_time) as first_start_time,
                MAX(tts.end_time) as last_end_time,
                BOOL_OR(tts.is_running) as has_running_session,
                CASE 
                    WHEN BOOL_OR(tts.is_running) THEN ''active''
                    WHEN COUNT(CASE WHEN tts.end_time IS NULL THEN 1 END) > 0 THEN ''paused''
                    ELSE ''completed''
                END as status,
                ARRAY_AGG(DISTINCT tts.title) FILTER (WHERE tts.title IS NOT NULL) as session_titles,
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        ''id'', tts.id,
                        ''title'', tts.title,
                        ''description'', tts.description,
                        ''start_time'', tts.start_time,
                        ''end_time'', tts.end_time,
                        ''duration_seconds'', tts.duration_seconds,
                        ''is_running'', tts.is_running,
                        ''category'', CASE WHEN ttc.id IS NOT NULL THEN 
                            JSON_BUILD_OBJECT(''name'', ttc.name, ''color'', ttc.color) 
                            ELSE NULL END
                    ) ORDER BY tts.start_time DESC
                ) as sessions
            FROM time_tracking_sessions tts
            LEFT JOIN users u ON u.id = tts.user_id
            LEFT JOIN time_tracking_categories ttc ON ttc.id = tts.category_id
            %s
            GROUP BY %s, tts.user_id, u.display_name, u.avatar_url
            ORDER BY period_key DESC, total_duration DESC
            LIMIT %s OFFSET %s
        )
        SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
                ''title'', COALESCE(display_name, ''Unknown User'') || '' - '' || period_key::TEXT,
                ''category'', NULL,
                ''sessions'', sessions,
                ''totalDuration'', total_duration,
                ''firstStartTime'', first_start_time,
                ''lastEndTime'', last_end_time,
                ''status'', status,
                ''user'', JSON_BUILD_OBJECT(
                    ''displayName'', display_name,
                    ''avatarUrl'', avatar_url
                ),
                ''period'', period_key::TEXT,
                ''sessionCount'', session_count,
                ''sessionTitles'', session_titles
            )
        ) as data
        FROM grouped_sessions',
        period_key_expression,
        where_clause,
        period_key_expression,
        p_limit,
        offset_value
    ) INTO sessions_data;
    
    -- Return paginated result with metadata
    RETURN JSON_BUILD_OBJECT(
        'data', COALESCE(sessions_data, '[]'::JSON),
        'pagination', JSON_BUILD_OBJECT(
            'page', p_page,
            'limit', p_limit,
            'total', total_count,
            'pages', CEIL(total_count::FLOAT / p_limit)
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get time tracking statistics
CREATE OR REPLACE FUNCTION get_time_tracking_stats(
    p_ws_id UUID,
    p_user_id UUID DEFAULT NULL -- If NULL, gets workspace-wide stats
)
RETURNS JSON AS $$
DECLARE
    stats_data JSON;
    user_filter TEXT := '';
BEGIN
    -- Set secure search path to prevent function hijacking
    PERFORM set_config('search_path', 'public, pg_temp', true);
    
    -- Check workspace membership authorization
    IF NOT EXISTS (
        SELECT 1 FROM workspace_members wm 
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied: not a member of this workspace';
    END IF;
    
    -- If specific user requested, ensure it's either the current user or user has admin access
    IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
        IF NOT EXISTS (
            SELECT 1 FROM workspace_members wm 
            WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid() 
            AND wm.role IN ('ADMIN', 'OWNER')
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
                       date - (ROW_NUMBER() OVER (ORDER BY date DESC) * INTERVAL ''1 day'') as group_date
                FROM daily_activity
            )
            SELECT COUNT(*) as streak
            FROM consecutive_days
            WHERE group_date = (
                SELECT group_date 
                FROM consecutive_days 
                WHERE rn = 1
            )
        )
        SELECT JSON_BUILD_OBJECT(
            ''totalSessions'', COALESCE(ss.total_sessions, 0),
            ''activeSessions'', COALESCE(ss.active_sessions, 0),
            ''activeUsers'', COALESCE(ss.active_users, 0),
            ''todayTime'', COALESCE(ss.today_time, 0),
            ''weekTime'', COALESCE(ss.week_time, 0),
            ''monthTime'', COALESCE(ss.month_time, 0),
            ''todaySessions'', COALESCE(ss.today_sessions, 0),
            ''weekSessions'', COALESCE(ss.week_sessions, 0),
            ''monthSessions'', COALESCE(ss.month_sessions, 0),
            ''streak'', COALESCE(acs.streak, 0)
        ) as stats
        FROM session_stats ss
        CROSS JOIN activity_streak acs',
        p_ws_id, user_filter, p_ws_id, user_filter
    ) INTO stats_data;
    
    RETURN stats_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get period summary statistics (for quick overview cards)
CREATE OR REPLACE FUNCTION get_period_summary_stats(
    p_ws_id UUID,
    p_period TEXT DEFAULT 'day' -- 'day', 'week', 'month'
)
RETURNS JSON AS $$
DECLARE
    summary_data JSON;
    period_key_expression TEXT;
BEGIN
    -- Set secure search path to prevent function hijacking
    PERFORM set_config('search_path', 'public, pg_temp', true);
    
    -- Validate input parameters
    IF p_period NOT IN ('day', 'week', 'month') THEN
        RAISE EXCEPTION 'Period must be one of: day, week, month';
    END IF;
    
    -- Check workspace membership authorization
    IF NOT EXISTS (
        SELECT 1 FROM workspace_members wm 
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied: not a member of this workspace';
    END IF;
    -- Determine period key expression
    CASE p_period
        WHEN 'day' THEN
            period_key_expression := 'date';
        WHEN 'week' THEN
            period_key_expression := 'DATE_TRUNC(''week'', date)::DATE';
        WHEN 'month' THEN
            period_key_expression := 'DATE_TRUNC(''month'', date)::DATE';
        ELSE
            period_key_expression := 'date';
    END CASE;
    
    -- Get period-based summary
    EXECUTE FORMAT(
        'WITH period_summary AS (
            SELECT 
                %s as period_key,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(*) as total_sessions,
                SUM(COALESCE(duration_seconds, 0)) as total_duration,
                AVG(COALESCE(duration_seconds, 0)) as avg_duration,
                MIN(start_time) as earliest_session,
                MAX(COALESCE(end_time, start_time)) as latest_session,
                COUNT(CASE WHEN is_running THEN 1 END) as active_sessions
            FROM time_tracking_sessions
            WHERE ws_id = ''%s'' AND duration_seconds IS NOT NULL
            GROUP BY %s
            ORDER BY period_key DESC
            LIMIT 10
        )
        SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
                ''period'', period_key::TEXT,
                ''uniqueUsers'', unique_users,
                ''totalSessions'', total_sessions,
                ''totalDuration'', total_duration,
                ''avgDuration'', ROUND(avg_duration),
                ''earliestSession'', earliest_session,
                ''latestSession'', latest_session,
                ''activeSessions'', active_sessions
            ) ORDER BY period_key DESC
        ) as summary
        FROM period_summary',
        period_key_expression,
        p_ws_id,
        period_key_expression
    ) INTO summary_data;
    
    RETURN COALESCE(summary_data, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get daily activity heatmap data
CREATE OR REPLACE FUNCTION get_daily_activity_heatmap(
    p_ws_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_days_back INTEGER DEFAULT 365
)
RETURNS JSON AS $$
DECLARE
    activity_data JSON;
    user_filter TEXT := '';
BEGIN
    -- Set secure search path to prevent function hijacking
    PERFORM set_config('search_path', 'public, pg_temp', true);
    
    -- Validate input parameters
    IF p_days_back <= 0 OR p_days_back > 1095 THEN -- Max 3 years
        RAISE EXCEPTION 'Days back must be between 1 and 1095';
    END IF;
    
    -- Check workspace membership authorization
    IF NOT EXISTS (
        SELECT 1 FROM workspace_members wm 
        WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied: not a member of this workspace';
    END IF;
    
    -- If specific user requested, ensure it's either the current user or user has admin access
    IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
        IF NOT EXISTS (
            SELECT 1 FROM workspace_members wm 
            WHERE wm.ws_id = p_ws_id AND wm.user_id = auth.uid() 
            AND wm.role IN ('ADMIN', 'OWNER')
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_time_tracking_sessions_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION get_time_tracking_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_period_summary_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_activity_heatmap TO authenticated;

-- Add RLS policies for the functions (they use SECURITY DEFINER but we still want to check workspace access)
-- The functions will internally verify workspace membership through the queries

-- Additional indexes for better performance
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_ws_user_date ON time_tracking_sessions(ws_id, user_id, date);
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_running ON time_tracking_sessions(ws_id, is_running) WHERE is_running = true;
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_duration ON time_tracking_sessions(ws_id, duration_seconds) WHERE duration_seconds IS NOT NULL;