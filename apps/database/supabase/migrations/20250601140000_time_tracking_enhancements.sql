-- Time tracking enhancements migration
-- Add computed columns and better indexing for improved performance

-- Add index for tags array search
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_tags ON public.time_tracking_sessions USING gin (tags);

-- Add index for date range queries
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_date_range ON public.time_tracking_sessions USING btree (ws_id, user_id, start_time);

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_category_date ON public.time_tracking_sessions USING btree (category_id, start_time) WHERE category_id IS NOT NULL;

-- Add index for task filtering
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_task_date ON public.time_tracking_sessions USING btree (task_id, start_time) WHERE task_id IS NOT NULL;

-- Function to calculate session productivity score (based on duration and category)
CREATE OR REPLACE FUNCTION calculate_productivity_score(duration_seconds INTEGER, category_color TEXT)
RETURNS INTEGER AS $$
BEGIN
    -- Base score from duration (up to 100 points for 4+ hours)
    DECLARE
        duration_score INTEGER := LEAST(duration_seconds / 144, 100); -- 144 seconds per point
        category_multiplier DECIMAL := 1.0;
    BEGIN
        -- Category-based multiplier
        CASE category_color
            WHEN 'BLUE', 'GREEN' THEN category_multiplier := 1.2;  -- Development, Meetings
            WHEN 'PURPLE', 'ORANGE' THEN category_multiplier := 1.1; -- Research, Planning
            ELSE category_multiplier := 1.0;
        END CASE;
        
        RETURN ROUND(duration_score * category_multiplier);
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add computed productivity score column (will be calculated via trigger)
ALTER TABLE public.time_tracking_sessions 
ADD COLUMN IF NOT EXISTS productivity_score INTEGER DEFAULT 0;

-- Function to update productivity score
CREATE OR REPLACE FUNCTION update_productivity_score()
RETURNS TRIGGER AS $$
BEGIN
    -- Only calculate for completed sessions
    IF NEW.duration_seconds IS NOT NULL AND NEW.category_id IS NOT NULL THEN
        NEW.productivity_score := calculate_productivity_score(
            NEW.duration_seconds,
            (SELECT color FROM time_tracking_categories WHERE id = NEW.category_id)
        );
    ELSE
        NEW.productivity_score := 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update productivity score
DROP TRIGGER IF EXISTS update_productivity_score_trigger ON time_tracking_sessions;
CREATE TRIGGER update_productivity_score_trigger
    BEFORE INSERT OR UPDATE ON time_tracking_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_productivity_score();

-- Update existing sessions with productivity scores
UPDATE time_tracking_sessions 
SET productivity_score = calculate_productivity_score(
    duration_seconds,
    COALESCE((SELECT color FROM time_tracking_categories WHERE id = time_tracking_sessions.category_id), 'GRAY')
) 
WHERE duration_seconds IS NOT NULL;

-- Create view for session analytics
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

-- Create function for session templates based on frequency
CREATE OR REPLACE FUNCTION get_session_templates(workspace_id UUID, user_id_param UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    title TEXT,
    description TEXT,
    category_id UUID,
    task_id UUID,
    tags TEXT[],
    category_name TEXT,
    category_color TEXT,
    task_name TEXT,
    usage_count BIGINT,
    avg_duration INTEGER,
    last_used TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tts.title,
        tts.description,
        tts.category_id,
        tts.task_id,
        tts.tags,
        ttc.name as category_name,
        ttc.color as category_color,
        t.name as task_name,
        COUNT(*) as usage_count,
        AVG(tts.duration_seconds)::INTEGER as avg_duration,
        MAX(tts.created_at) as last_used
    FROM time_tracking_sessions tts
    LEFT JOIN time_tracking_categories ttc ON tts.category_id = ttc.id
    LEFT JOIN tasks t ON tts.task_id = t.id
    WHERE tts.ws_id = workspace_id 
        AND tts.user_id = user_id_param
        AND tts.is_running = FALSE
        AND tts.duration_seconds IS NOT NULL
        AND tts.duration_seconds > 300  -- At least 5 minutes
    GROUP BY tts.title, tts.description, tts.category_id, tts.task_id, tts.tags, ttc.name, ttc.color, t.name
    HAVING COUNT(*) >= 2  -- Used at least twice
    ORDER BY usage_count DESC, last_used DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql; 