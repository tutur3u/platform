-- Update get_time_tracker_stats to support days_back parameter for optimization
DROP FUNCTION IF EXISTS get_time_tracker_stats(UUID, UUID, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION get_time_tracker_stats(
  p_user_id UUID,
  p_ws_id UUID,
  p_is_personal BOOLEAN DEFAULT FALSE,
  p_timezone TEXT DEFAULT 'UTC',
  p_days_back INTEGER DEFAULT 365
)
RETURNS TABLE(
  today_time BIGINT,
  week_time BIGINT,
  month_time BIGINT,
  streak INTEGER,
  daily_activity JSONB
) AS $$
DECLARE
  v_start_of_week DATE;
  v_start_of_month DATE;
  v_current_date DATE;
  v_lookback_days INTEGER;
BEGIN
  -- Calculate current date in the user's timezone
  v_current_date := (CURRENT_TIMESTAMP AT TIME ZONE p_timezone)::DATE;
  
  -- Calculate start of week (Monday) in user's timezone
  v_start_of_week := DATE_TRUNC('week', v_current_date::TIMESTAMP)::DATE;
  -- Calculate start of month in user's timezone
  v_start_of_month := DATE_TRUNC('month', v_current_date::TIMESTAMP)::DATE;

  -- Always look back at least 31 days to ensure month summary is correct
  v_lookback_days := GREATEST(31, p_days_back);

  RETURN QUERY
  WITH timezone_sessions AS (
    -- For each session, generate a row for each day it spans IN THE USER'S TIMEZONE
    SELECT
      s.id,
      s.user_id,
      s.ws_id,
      s.start_time,
      s.end_time,
      s.duration_seconds,
      day_series.activity_date,
      -- Calculate how much of the session falls on this day in user's timezone
      CASE
        -- Session starts and ends on the same day in user's timezone
        WHEN (s.start_time AT TIME ZONE p_timezone)::DATE = 
             (COALESCE(s.end_time, s.start_time) AT TIME ZONE p_timezone)::DATE THEN
          s.duration_seconds
        -- Session spans multiple days - calculate duration for this specific day
        ELSE
          EXTRACT(EPOCH FROM (
            LEAST(
              -- End of this day in user's timezone (converted back to UTC for comparison)
              (day_series.activity_date + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE p_timezone,
              COALESCE(s.end_time, CURRENT_TIMESTAMP)
            )
            -
            GREATEST(
              -- Start of this day in user's timezone (converted back to UTC for comparison)
              day_series.activity_date::TIMESTAMP AT TIME ZONE p_timezone,
              s.start_time
            )
          ))::BIGINT
      END AS day_duration
    FROM time_tracking_sessions s
    CROSS JOIN LATERAL generate_series(
      (s.start_time AT TIME ZONE p_timezone)::DATE,
      (COALESCE(s.end_time, s.start_time) AT TIME ZONE p_timezone)::DATE,
      '1 day'::INTERVAL
    ) AS day_series(activity_date)
    WHERE s.user_id = p_user_id
      AND (p_is_personal OR s.ws_id = p_ws_id)
      AND s.duration_seconds IS NOT NULL
      AND (COALESCE(s.end_time, CURRENT_TIMESTAMP) AT TIME ZONE p_timezone)::DATE >= v_current_date - MAKE_INTERVAL(days => v_lookback_days)
  ),
  daily_aggregates AS (
    SELECT
      activity_date,
      SUM(day_duration) AS total_duration,
      COUNT(DISTINCT id) AS session_count
    FROM timezone_sessions
    WHERE day_duration > 0
    GROUP BY activity_date
  ),
  stats AS (
    SELECT
      -- Today's total duration (in user's timezone)
      COALESCE(SUM(
        CASE 
          WHEN activity_date = v_current_date 
          THEN total_duration 
          ELSE 0 
        END
      ), 0)::BIGINT AS today_duration,
      
      -- This week's total duration (in user's timezone)
      COALESCE(SUM(
        CASE 
          WHEN activity_date >= v_start_of_week 
          THEN total_duration 
          ELSE 0 
        END
      ), 0)::BIGINT AS week_duration,
      
      -- This month's total duration (in user's timezone)
      COALESCE(SUM(
        CASE 
          WHEN activity_date >= v_start_of_month 
          THEN total_duration 
          ELSE 0 
        END
      ), 0)::BIGINT AS month_duration,
      
      -- Daily activity as JSON array
      COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'date', activity_date::TEXT,
            'duration', total_duration,
            'sessions', session_count
          )
          ORDER BY activity_date DESC
        ) FILTER (WHERE activity_date >= v_current_date - MAKE_INTERVAL(days => p_days_back)),
        '[]'::JSONB
      ) AS daily_data
      
    FROM daily_aggregates
  )
  SELECT 
    stats.today_duration,
    stats.week_duration,
    stats.month_duration,
    calculate_time_tracker_streak(p_user_id, p_ws_id, p_is_personal),
    stats.daily_data
  FROM stats;
END;
$$ LANGUAGE plpgsql STABLE;
