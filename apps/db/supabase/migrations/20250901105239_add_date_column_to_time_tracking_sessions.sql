-- Add date column to time_tracking_sessions for better querying and grouping
ALTER TABLE time_tracking_sessions ADD COLUMN date DATE GENERATED ALWAYS AS ((start_time AT TIME ZONE 'UTC')::date) STORED;

-- Create index on the date column for performance
CREATE INDEX IF NOT EXISTS idx_time_tracking_sessions_date ON time_tracking_sessions(date);