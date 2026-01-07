-- Migration: Clean up group sessions when start_date or ending_date changes
-- Purpose: Automatically remove sessions that fall outside the updated date range

-- Function to clean up sessions outside the date range
CREATE OR REPLACE FUNCTION clean_group_sessions_on_date_change()
RETURNS TRIGGER AS $$
DECLARE
  new_sessions date[];
BEGIN
  -- Use set-based approach with UNNEST and array_agg for better performance
  -- We use WITH ORDINALITY to preserve the original order of sessions
  SELECT COALESCE(array_agg(s ORDER BY ord), ARRAY[]::date[])
  INTO new_sessions
  FROM unnest(NEW.sessions) WITH ORDINALITY AS t(s, ord)
  WHERE 
    (NEW.starting_date IS NULL OR s >= NEW.starting_date::date)
    AND (NEW.ending_date IS NULL OR s <= NEW.ending_date::date);

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