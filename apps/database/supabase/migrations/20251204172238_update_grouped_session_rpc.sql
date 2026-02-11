-- Migration: Add RPC function for grouped sessions with date range filtering
-- Description: Creates a function that properly handles date range filtering and overnight sessions
-- This replaces the fallback JavaScript implementation with server-side PostgreSQL logic
-- FIX: Properly splits overnight sessions across multiple periods (days) using generate_series

-- Drop existing function if exists (for idempotency)
DROP FUNCTION IF EXISTS get_grouped_sessions_paginated(UUID, TEXT, INTEGER, INTEGER, TEXT, DATE, DATE, TEXT);

-- Create optimized RPC function for grouped sessions with date range filtering
CREATE OR REPLACE FUNCTION get_grouped_sessions_paginated(
    p_ws_id UUID,
    p_period TEXT DEFAULT 'day',           -- 'day', 'week', 'month'
    p_page INTEGER DEFAULT 1,
    p_limit INTEGER DEFAULT 50,
    p_search TEXT DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,        -- Filter: start date (inclusive)
    p_end_date DATE DEFAULT NULL,          -- Filter: end date (inclusive)
    p_timezone TEXT DEFAULT 'UTC'          -- User's timezone for proper period calculations
)
RETURNS JSON AS $$
DECLARE
    v_offset INTEGER;
    v_total_count INTEGER;
    v_sessions_data JSON;
    v_filter_start TIMESTAMPTZ;
    v_filter_end TIMESTAMPTZ;
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
    v_offset := (p_page - 1) * p_limit;
    
    -- Convert date filters to timestamptz in user's timezone
    IF p_start_date IS NOT NULL THEN
        v_filter_start := (p_start_date::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone;
    END IF;
    IF p_end_date IS NOT NULL THEN
        v_filter_end := (p_end_date::TEXT || ' 23:59:59.999')::TIMESTAMP AT TIME ZONE p_timezone;
    END IF;
    
    -- Main query: Get grouped sessions with proper overnight session handling
    WITH 
    -- Step 1: Filter sessions that overlap with the date range
    filtered_sessions AS (
        SELECT 
            tts.*,
            u.display_name,
            u.avatar_url,
            ttc.name AS category_name,
            ttc.color AS category_color,
            -- Calculate local start and end dates for generating day series
            (tts.start_time AT TIME ZONE p_timezone)::DATE AS local_start_date,
            (COALESCE(tts.end_time, NOW()) AT TIME ZONE p_timezone)::DATE AS local_end_date
        FROM time_tracking_sessions tts
        LEFT JOIN users u ON u.id = tts.user_id
        LEFT JOIN time_tracking_categories ttc ON ttc.id = tts.category_id
        WHERE tts.ws_id = p_ws_id
            -- Search filter
            AND (
                p_search IS NULL 
                OR LENGTH(TRIM(p_search)) = 0
                OR tts.title ILIKE '%' || p_search || '%'
                OR u.display_name ILIKE '%' || p_search || '%'
            )
            -- Date range filter: session overlaps with [filter_start, filter_end]
            -- A session overlaps if: start_time <= filter_end AND (end_time >= filter_start OR end_time IS NULL)
            AND (
                v_filter_start IS NULL 
                OR tts.end_time >= v_filter_start 
                OR tts.end_time IS NULL
            )
            AND (
                v_filter_end IS NULL 
                OR tts.start_time <= v_filter_end
            )
    ),
    
    -- Step 2: Generate all days that each session spans
    -- This is crucial for overnight sessions - they need to appear on EACH day they touch
    session_days AS (
        SELECT 
            fs.*,
            day_date::DATE AS period_key,
            -- Calculate period start (start of this day in user timezone)
            (day_date::DATE::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone AS period_start,
            -- Calculate period end (end of this day in user timezone)
            (day_date::DATE::TEXT || ' 23:59:59.999')::TIMESTAMP AT TIME ZONE p_timezone AS period_end
        FROM filtered_sessions fs
        -- Generate a row for EACH day the session spans
        CROSS JOIN LATERAL generate_series(
            fs.local_start_date::TIMESTAMP,
            fs.local_end_date::TIMESTAMP,
            INTERVAL '1 day'
        ) AS day_date
        WHERE p_period = 'day'
    ),
    
    -- Step 2b: For week period, generate week periods
    session_weeks AS (
        SELECT 
            fs.*,
            week_start::DATE AS period_key,
            (week_start::DATE::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone AS period_start,
            ((week_start::DATE + INTERVAL '6 days')::DATE::TEXT || ' 23:59:59.999')::TIMESTAMP AT TIME ZONE p_timezone AS period_end
        FROM filtered_sessions fs
        CROSS JOIN LATERAL generate_series(
            DATE_TRUNC('week', fs.local_start_date::TIMESTAMP),
            DATE_TRUNC('week', fs.local_end_date::TIMESTAMP),
            INTERVAL '1 week'
        ) AS week_start
        WHERE p_period = 'week'
    ),
    
    -- Step 2c: For month period, generate month periods  
    session_months AS (
        SELECT 
            fs.*,
            month_start::DATE AS period_key,
            (month_start::DATE::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE p_timezone AS period_start,
            ((month_start::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE::TEXT || ' 23:59:59.999')::TIMESTAMP AT TIME ZONE p_timezone AS period_end
        FROM filtered_sessions fs
        CROSS JOIN LATERAL generate_series(
            DATE_TRUNC('month', fs.local_start_date::TIMESTAMP),
            DATE_TRUNC('month', fs.local_end_date::TIMESTAMP),
            INTERVAL '1 month'
        ) AS month_start
        WHERE p_period = 'month'
    ),
    
    -- Step 3: Combine all period types
    session_periods AS (
        SELECT * FROM session_days
        UNION ALL
        SELECT * FROM session_weeks
        UNION ALL
        SELECT * FROM session_months
    ),
    
    -- Step 4: Calculate the duration that falls within each period
    -- This handles overnight sessions by clipping to period boundaries
    session_with_period_duration AS (
        SELECT 
            sp.*,
            -- Calculate duration within this period
            -- effective_start = MAX(session_start, period_start)
            -- effective_end = MIN(session_end or now(), period_end)
            -- period_duration = effective_end - effective_start
            GREATEST(0, 
                EXTRACT(EPOCH FROM (
                    LEAST(COALESCE(sp.end_time, NOW()), sp.period_end) - 
                    GREATEST(sp.start_time, sp.period_start)
                ))
            )::INTEGER AS period_duration_seconds
        FROM session_periods sp
        -- Filter out periods that don't overlap with the date filter
        WHERE (p_start_date IS NULL OR sp.period_key >= p_start_date)
          AND (p_end_date IS NULL OR sp.period_key <= p_end_date)
          -- Only include periods where the session actually has time in that period
          AND (
              LEAST(COALESCE(sp.end_time, NOW()), sp.period_end) > 
              GREATEST(sp.start_time, sp.period_start)
          )
    ),
    
    -- Step 5: Group sessions by period and user
    grouped_data AS (
        SELECT 
            spd.period_key,
            spd.user_id,
            spd.display_name,
            spd.avatar_url,
            COUNT(DISTINCT spd.id) AS session_count,
            SUM(COALESCE(spd.duration_seconds, 0)) AS total_duration,
            SUM(spd.period_duration_seconds) AS period_duration,
            MIN(spd.start_time) AS first_start_time,
            MAX(spd.end_time) AS last_end_time,
            BOOL_OR(spd.is_running) AS has_running_session,
            CASE 
                WHEN BOOL_OR(spd.is_running) THEN 'active'
                ELSE 'completed'
            END AS status,
            ARRAY_AGG(DISTINCT spd.title) FILTER (WHERE spd.title IS NOT NULL) AS session_titles,
            JSON_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'id', spd.id,
                    'title', spd.title,
                    'description', spd.description,
                    'start_time', spd.start_time,
                    'end_time', spd.end_time,
                    'duration_seconds', spd.duration_seconds,
                    'is_running', spd.is_running,
                    'category', CASE WHEN spd.category_name IS NOT NULL THEN 
                        JSONB_BUILD_OBJECT('name', spd.category_name, 'color', spd.category_color) 
                        ELSE NULL END,
                    'user', JSONB_BUILD_OBJECT(
                        'display_name', spd.display_name,
                        'avatar_url', spd.avatar_url
                    )
                )
            ) AS sessions
        FROM session_with_period_duration spd
        GROUP BY spd.period_key, spd.user_id, spd.display_name, spd.avatar_url
    ),
    
    -- Step 6: Get total count for pagination
    count_data AS (
        SELECT COUNT(*) AS total FROM grouped_data
    ),
    
    -- Step 7: Paginate the results
    paginated_data AS (
        SELECT *
        FROM grouped_data
        ORDER BY period_key DESC, total_duration DESC
        LIMIT p_limit OFFSET v_offset
    )
    
    -- Build final result
    SELECT 
        JSON_BUILD_OBJECT(
            'data', COALESCE(
                (SELECT JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'title', COALESCE(pd.display_name, 'Unknown User') || ' - ' || pd.period_key::TEXT,
                        'category', NULL,
                        'sessions', pd.sessions,
                        'totalDuration', pd.total_duration,
                        'periodDuration', pd.period_duration,
                        'firstStartTime', pd.first_start_time,
                        'lastEndTime', pd.last_end_time,
                        'status', pd.status,
                        'user', JSON_BUILD_OBJECT(
                            'displayName', pd.display_name,
                            'avatarUrl', pd.avatar_url
                        ),
                        'period', pd.period_key::TEXT,
                        'sessionCount', pd.session_count,
                        'sessionTitles', pd.session_titles
                    )
                    ORDER BY pd.period_key DESC, pd.total_duration DESC
                ) FROM paginated_data pd),
                '[]'::JSON
            ),
            'pagination', JSON_BUILD_OBJECT(
                'page', p_page,
                'limit', p_limit,
                'total', (SELECT total FROM count_data),
                'pages', CEIL((SELECT total FROM count_data)::FLOAT / p_limit)
            )
        )
    INTO v_sessions_data;
    
    RETURN v_sessions_data;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Add helpful comment
COMMENT ON FUNCTION get_grouped_sessions_paginated(UUID, TEXT, INTEGER, INTEGER, TEXT, DATE, DATE, TEXT) IS
'Returns paginated time tracking sessions grouped by period (day/week/month) and user.
Supports date range filtering with proper handling of overnight sessions that span multiple periods.
The periodDuration field contains the duration that falls within each specific period.
Overnight sessions are properly split and appear on EACH day they span.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_grouped_sessions_paginated(UUID, TEXT, INTEGER, INTEGER, TEXT, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_grouped_sessions_paginated(UUID, TEXT, INTEGER, INTEGER, TEXT, DATE, DATE, TEXT) TO service_role;

-- Add index for better performance on date-filtered queries
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_ws_date_range
    ON time_tracking_sessions(ws_id, start_time, end_time)
    WHERE duration_seconds IS NOT NULL;

-- Add index for search queries
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_title_trgm
    ON time_tracking_sessions USING gin(title gin_trgm_ops);

-- Note: The gin_trgm_ops index requires pg_trgm extension. 
-- If not available, comment out the above index creation.
