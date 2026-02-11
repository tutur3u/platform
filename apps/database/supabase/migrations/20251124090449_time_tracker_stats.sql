-- Create a view for time tracker statistics
-- This view calculates daily aggregated stats for each user/workspace combination

-- First, create a view for daily activity aggregation
CREATE OR REPLACE VIEW time_tracker_daily_activity AS
SELECT 
  user_id,
  ws_id,
  DATE(start_time) AS activity_date,
  SUM(duration_seconds) AS total_duration,
  COUNT(*) AS session_count
FROM time_tracking_sessions
WHERE duration_seconds IS NOT NULL
GROUP BY user_id, ws_id, DATE(start_time);

-- Create a function to calculate streak for a user
-- This function calculates consecutive days of activity using gap-and-islands pattern
CREATE OR REPLACE FUNCTION calculate_time_tracker_streak(
  p_user_id UUID,
  p_ws_id UUID,
  p_is_personal BOOLEAN
)
RETURNS INTEGER AS $$
DECLARE
  v_streak INTEGER := 0;
BEGIN
  -- Use gap-and-islands pattern with ROW_NUMBER() to find consecutive activity groups
  -- in a single query instead of looping with O(n) EXISTS checks
  WITH activity_data AS (
    SELECT DISTINCT activity_date
    FROM time_tracker_daily_activity
    WHERE user_id = p_user_id
      AND (p_is_personal OR ws_id = p_ws_id)
      AND activity_date <= CURRENT_DATE
  ),
  -- Create islands by subtracting row number from date
  -- Consecutive dates will have the same island_id
  islands AS (
    SELECT 
      activity_date,
      activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date))::INTEGER AS island_id
    FROM activity_data
  ),
  -- Aggregate each island to find first and last date, and count
  island_groups AS (
    SELECT 
      island_id,
      MIN(activity_date) AS first_date,
      MAX(activity_date) AS last_date,
      COUNT(*)::INTEGER AS day_count
    FROM islands
    GROUP BY island_id
  )
  -- Find the island whose last_date is today or yesterday
  -- (streak continues if activity was today, or if yesterday was the last day)
  SELECT day_count INTO v_streak
  FROM island_groups
  WHERE last_date = CURRENT_DATE 
     OR last_date = CURRENT_DATE - INTERVAL '1 day'
  ORDER BY last_date DESC
  LIMIT 1;

  -- Return 0 if no streak found (handles no-activity case)
  RETURN COALESCE(v_streak, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Create a function to get time tracker stats for a user/workspace
-- This replaces the server-side calculation logic
CREATE OR REPLACE FUNCTION get_time_tracker_stats(
  p_user_id UUID,
  p_ws_id UUID,
  p_is_personal BOOLEAN DEFAULT FALSE
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
BEGIN
  -- Calculate start of week (Monday)
  v_start_of_week := DATE_TRUNC('week', CURRENT_DATE)::DATE + INTERVAL '0 days';
  -- If today is Sunday, adjust to previous Monday
  IF EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN
    v_start_of_week := v_start_of_week - INTERVAL '7 days';
  END IF;
  
  -- Calculate start of month
  v_start_of_month := DATE_TRUNC('month', CURRENT_DATE)::DATE;

  RETURN QUERY
  WITH stats AS (
    SELECT
      -- Today's total duration
      COALESCE(SUM(
        CASE 
          WHEN activity_date = CURRENT_DATE 
          THEN total_duration 
          ELSE 0 
        END
      ), 0)::BIGINT AS today_duration,
      
      -- This week's total duration
      COALESCE(SUM(
        CASE 
          WHEN activity_date >= v_start_of_week 
          THEN total_duration 
          ELSE 0 
        END
      ), 0)::BIGINT AS week_duration,
      
      -- This month's total duration
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
        ) FILTER (WHERE activity_date >= CURRENT_DATE - INTERVAL '1 year'),
        '[]'::JSONB
      ) AS daily_data
      
    FROM time_tracker_daily_activity
    WHERE user_id = p_user_id
      AND (p_is_personal OR ws_id = p_ws_id)
      AND activity_date >= CURRENT_DATE - INTERVAL '1 year'
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

-- Add helpful comment
COMMENT ON FUNCTION get_time_tracker_stats IS 
'Returns time tracking statistics for a user in a workspace. Calculates today, week, month totals, streak, and daily activity data.';

COMMENT ON FUNCTION calculate_time_tracker_streak IS 
'Calculates the current streak of consecutive days with time tracking activity.';

COMMENT ON VIEW time_tracker_daily_activity IS 
'Aggregates time tracking sessions by user, workspace, and date for efficient querying.';
