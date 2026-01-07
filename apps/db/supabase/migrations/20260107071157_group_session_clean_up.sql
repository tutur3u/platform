-- Migration: Clean up group sessions when start_date or ending_date changes
-- Purpose: Automatically remove sessions that fall outside the updated date range

-- Function to clean up sessions outside the date range
CREATE OR REPLACE FUNCTION clean_group_sessions_on_date_change()
RETURNS TRIGGER AS $$
DECLARE
  session_date date;
  session_text text;
  new_sessions text[];
BEGIN
  -- Initialize empty array for valid sessions
  new_sessions := ARRAY[]::text[];
  
  -- Only process if sessions array is not null and dates are set
  IF NEW.sessions IS NOT NULL AND array_length(NEW.sessions, 1) > 0 THEN
    -- Iterate through each session
    FOR i IN 1..array_length(NEW.sessions, 1) LOOP
      -- Get the session as text
      session_text := NEW.sessions[i];
      
      -- Parse the session date (format: 'YYYY-MM-DD')
      session_date := session_text::date;
      
      -- Check if session falls within the date range
      -- Include session if:
      -- 1. It's after or equal to starting_date (if set)
      -- 2. It's before or equal to ending_date (if set)
      IF (NEW.starting_date IS NULL OR session_date >= NEW.starting_date::date) AND
         (NEW.ending_date IS NULL OR session_date <= NEW.ending_date::date) THEN
        new_sessions := array_append(new_sessions, session_text);
      END IF;
    END LOOP;
  END IF;
  
  -- Update the sessions array with only valid sessions
  NEW.sessions := new_sessions;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires before update on workspace_user_groups
-- Only triggers when starting_date or ending_date is changed
DROP TRIGGER IF EXISTS trigger_clean_group_sessions_on_date_change ON workspace_user_groups;

CREATE TRIGGER trigger_clean_group_sessions_on_date_change
  BEFORE UPDATE ON workspace_user_groups
  FOR EACH ROW
  WHEN (
    OLD.starting_date IS DISTINCT FROM NEW.starting_date OR
    OLD.ending_date IS DISTINCT FROM NEW.ending_date
  )
  EXECUTE FUNCTION clean_group_sessions_on_date_change();

-- Add comment for documentation
COMMENT ON FUNCTION clean_group_sessions_on_date_change() IS 
  'Automatically removes sessions from workspace_user_groups.sessions array that fall outside the starting_date and ending_date range when either date is modified';

COMMENT ON TRIGGER trigger_clean_group_sessions_on_date_change ON workspace_user_groups IS 
  'Triggers session cleanup when starting_date or ending_date is updated';