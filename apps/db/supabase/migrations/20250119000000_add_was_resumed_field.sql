-- Add was_resumed field to time_tracking_sessions table
-- This field tracks whether a session was created by resuming a previous session

ALTER TABLE public.time_tracking_sessions 
ADD COLUMN was_resumed boolean DEFAULT false;

-- Back-fill existing rows to ensure no NULL values
UPDATE public.time_tracking_sessions 
SET was_resumed = false 
WHERE was_resumed IS NULL;

-- Add NOT NULL constraint to prevent tri-state logic
ALTER TABLE public.time_tracking_sessions 
ALTER COLUMN was_resumed SET NOT NULL;

-- Add index for analytics queries that filter by was_resumed
CREATE INDEX idx_time_tracking_sessions_was_resumed 
ON public.time_tracking_sessions USING btree (was_resumed) 
WHERE was_resumed = true;

-- Update the time_tracking_session_analytics view to include was_resumed
CREATE OR REPLACE VIEW time_tracking_session_analytics AS
SELECT 
    tts.*,
    ttc.name as category_name,
    ttc.color as category_color,
    t.name as task_name,
    EXTRACT(HOUR FROM tts.start_time) as start_hour,
    EXTRACT(DOW FROM tts.start_time) as day_of_week,
    DATE_TRUNC('day', tts.start_time) as session_date,
    DATE_TRUNC('week', tts.start_time) as session_week,
    DATE_TRUNC('month', tts.start_time) as session_month,
    CASE 
        WHEN tts.duration_seconds >= 7200 THEN 'long'    -- 2+ hours
        WHEN tts.duration_seconds >= 1800 THEN 'medium'  -- 30min - 2 hours  
        WHEN tts.duration_seconds >= 300 THEN 'short'    -- 5-30 minutes
        ELSE 'micro'                                      -- < 5 minutes
    END as session_length_category
FROM time_tracking_sessions tts
LEFT JOIN time_tracking_categories ttc ON tts.category_id = ttc.id
LEFT JOIN tasks t ON tts.task_id = t.id; 