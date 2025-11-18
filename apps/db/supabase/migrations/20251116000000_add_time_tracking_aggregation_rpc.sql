-- Migration: Add RPC function for time tracking aggregation
-- Description: Optimizes daily report generation by moving aggregation from Python to PostgreSQL
-- Created: 2025-11-16

-- Drop existing function if exists (for idempotency)
DROP FUNCTION IF EXISTS get_workspace_time_tracking_stats(uuid, timestamptz);

-- Create optimized RPC function for time tracking aggregation
CREATE OR REPLACE FUNCTION get_workspace_time_tracking_stats(
    p_workspace_id uuid,
    p_target_date timestamptz DEFAULT NOW()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_start_of_day timestamptz;
    v_start_of_yesterday timestamptz;
    v_start_of_week timestamptz;
    v_start_of_month timestamptz;
    v_result jsonb;
BEGIN
    -- Calculate time boundaries using GMT+7 timezone
    v_start_of_day := date_trunc('day', p_target_date AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
    v_start_of_yesterday := v_start_of_day - INTERVAL '1 day';
    v_start_of_week := date_trunc('week', v_start_of_day);
    v_start_of_month := date_trunc('month', v_start_of_day);

    -- Aggregate time tracking stats for all workspace members
    SELECT jsonb_build_object(
        'aggregated', COALESCE(jsonb_agg(
            jsonb_build_object(
                'user', jsonb_build_object(
                    'platform_user_id', u.id,
                    'display_name', u.display_name,
                    'handle', u.handle
                ),
                'stats', jsonb_build_object(
                    'todayTime', COALESCE(user_stats.today_time, 0),
                    'yesterdayTime', COALESCE(user_stats.yesterday_time, 0),
                    'weekTime', COALESCE(user_stats.week_time, 0),
                    'monthTime', COALESCE(user_stats.month_time, 0)
                )
            )
        ), '[]'::jsonb),
        'members', COALESCE(jsonb_agg(
            jsonb_build_object(
                'platform_user_id', u.id,
                'display_name', u.display_name,
                'handle', u.handle
            )
        ), '[]'::jsonb)
    ) INTO v_result
    FROM workspace_members wm
    INNER JOIN users u ON u.id = wm.user_id
    LEFT JOIN LATERAL (
        SELECT
            -- Today's time (sessions starting today)
            SUM(
                CASE
                    WHEN tts.start_time >= v_start_of_day
                    THEN tts.duration_seconds
                    ELSE 0
                END
            ) AS today_time,
            -- Yesterday's time
            SUM(
                CASE
                    WHEN tts.start_time >= v_start_of_yesterday
                        AND tts.start_time < v_start_of_day
                    THEN tts.duration_seconds
                    ELSE 0
                END
            ) AS yesterday_time,
            -- Week's time
            SUM(
                CASE
                    WHEN tts.start_time >= v_start_of_week
                    THEN tts.duration_seconds
                    ELSE 0
                END
            ) AS week_time,
            -- Month's time
            SUM(
                CASE
                    WHEN tts.start_time >= v_start_of_month
                    THEN tts.duration_seconds
                    ELSE 0
                END
            ) AS month_time
        FROM time_tracking_sessions tts
        WHERE tts.user_id = u.id
            AND tts.ws_id = p_workspace_id
            AND tts.start_time >= v_start_of_month
            AND tts.duration_seconds IS NOT NULL
    ) user_stats ON true
    WHERE wm.ws_id = p_workspace_id;

    RETURN v_result;
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION get_workspace_time_tracking_stats(uuid, timestamptz) IS
'Aggregates time tracking statistics for all members of a workspace. Returns today, yesterday, week, and month totals for each user. Used by Discord daily report generation.';

-- Grant execute permission to authenticated users (adjust as needed for your RLS setup)
GRANT EXECUTE ON FUNCTION get_workspace_time_tracking_stats(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION get_workspace_time_tracking_stats(uuid, timestamptz) TO service_role;

-- Add indexes for optimal query performance
-- Index for workspace + start_time queries (most common)
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_ws_start_time
    ON time_tracking_sessions(ws_id, start_time DESC)
    WHERE duration_seconds IS NOT NULL;

-- Index for user + workspace + start_time queries
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_user_ws_start
    ON time_tracking_sessions(user_id, ws_id, start_time DESC)
    WHERE duration_seconds IS NOT NULL;

-- Composite index for workspace + user queries (most specific, covers daily report queries)
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_ws_user_start
    ON time_tracking_sessions(ws_id, user_id, start_time DESC)
    WHERE duration_seconds IS NOT NULL;

-- Add comments for indexes
COMMENT ON INDEX idx_time_tracking_sessions_ws_start_time IS
'Optimizes workspace-wide time tracking queries by workspace and start time';

COMMENT ON INDEX idx_time_tracking_sessions_user_ws_start IS
'Optimizes per-user time tracking queries';

COMMENT ON INDEX idx_time_tracking_sessions_ws_user_start IS
'Composite index for workspace + user queries with completed sessions (used by daily reports)';

-- Performance note:
-- This RPC function should provide 10-100x performance improvement over client-side aggregation
-- for workspaces with >50 users or >1000 time tracking sessions per month.
-- The function uses STABLE (not VOLATILE) since it doesn't modify data and can be cached within a transaction.
