-- Fix time tracker stats to properly handle sessions that cross days, weeks, and months
-- This migration replaces the time_tracker_daily_activity view and get_time_tracker_stats function
-- to split sessions across the actual days they span IN THE USER'S TIMEZONE, matching the behavior of the history page.

-- Drop the existing view and function
DROP VIEW IF EXISTS time_tracker_daily_activity CASCADE;
DROP FUNCTION IF EXISTS get_time_tracker_stats(UUID, UUID, BOOLEAN);

-- Keep the UTC-based view for backward compatibility and non-timezone-aware queries
CREATE OR REPLACE VIEW time_tracker_daily_activity AS
WITH session_days AS (
  SELECT 
    s.id,
    s.user_id,
    s.ws_id,
    s.start_time,
    s.end_time,
    s.duration_seconds,
    -- Generate a series of dates from start to end date (UTC-based)
    generate_series(
      DATE(s.start_time),
      DATE(COALESCE(s.end_time, s.start_time)),
      '1 day'::INTERVAL
    )::DATE AS activity_date
  FROM time_tracking_sessions s
  WHERE s.duration_seconds IS NOT NULL
)
SELECT 
  sd.user_id,
  sd.ws_id,
  sd.activity_date,
  -- Calculate the portion of duration that falls on this specific day (UTC)
  SUM(
    CASE
      -- Session starts and ends on the same day
      WHEN DATE(sd.start_time) = DATE(COALESCE(sd.end_time, sd.start_time)) THEN
        sd.duration_seconds
      
      -- Session spans multiple days - calculate duration for this specific day
      ELSE
        EXTRACT(EPOCH FROM (
          -- End of overlap period (min of: end of this day, session end time)
          LEAST(
            (sd.activity_date + INTERVAL '1 day')::TIMESTAMP,
            COALESCE(sd.end_time, CURRENT_TIMESTAMP)
          )
          -
          -- Start of overlap period (max of: start of this day, session start time)
          GREATEST(
            sd.activity_date::TIMESTAMP,
            sd.start_time
          )
        ))::BIGINT
    END
  ) AS total_duration,
  COUNT(DISTINCT sd.id) AS session_count
FROM session_days sd
GROUP BY sd.user_id, sd.ws_id, sd.activity_date;

COMMENT ON VIEW time_tracker_daily_activity IS 
'Aggregates time tracking sessions by user, workspace, and date (UTC). Properly splits sessions that cross multiple days, calculating the exact duration that falls on each day.';

-- Timezone-aware stats function that calculates splits based on user's local timezone
CREATE OR REPLACE FUNCTION get_time_tracker_stats(
  p_user_id UUID,
  p_ws_id UUID,
  p_is_personal BOOLEAN DEFAULT FALSE,
  p_timezone TEXT DEFAULT 'UTC'
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
BEGIN
  -- Calculate current date in the user's timezone
  v_current_date := (CURRENT_TIMESTAMP AT TIME ZONE p_timezone)::DATE;
  
  -- Calculate start of week (Monday) in user's timezone
  v_start_of_week := DATE_TRUNC('week', v_current_date::TIMESTAMP)::DATE;
  -- If today is Sunday, adjust to previous Monday
  IF EXTRACT(DOW FROM v_current_date::TIMESTAMP) = 0 THEN
    v_start_of_week := v_start_of_week - INTERVAL '7 days';
  END IF;
  
  -- Calculate start of month in user's timezone
  v_start_of_month := DATE_TRUNC('month', v_current_date::TIMESTAMP)::DATE;

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
      AND (s.start_time AT TIME ZONE p_timezone)::DATE >= v_current_date - INTERVAL '1 year'
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
      
      -- Daily activity as JSON array (last year of data)
      COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'date', activity_date::TEXT,
            'duration', total_duration,
            'sessions', session_count
          )
          ORDER BY activity_date DESC
        ),
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

COMMENT ON FUNCTION get_time_tracker_stats IS 
'Returns timezone-aware time tracking statistics for a user in a workspace. Calculates today, week, month totals, streak, and daily activity data based on the specified timezone. Sessions that cross days are properly split based on the user''s local timezone.';
