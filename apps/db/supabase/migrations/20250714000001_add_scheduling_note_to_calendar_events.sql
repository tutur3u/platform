-- Add scheduling_note field to workspace_calendar_events table
-- This field will be used to store metadata for event conversion between all-day and timed events

ALTER TABLE workspace_calendar_events 
ADD COLUMN scheduling_note TEXT;

-- Add a comment to explain the purpose of this field
COMMENT ON COLUMN workspace_calendar_events.scheduling_note IS 'Stores metadata for event conversion between all-day and timed events, including preserved timestamps'; 