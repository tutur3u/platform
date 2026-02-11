-- Migration: Prevent modification of missed_entry_date_threshold on personal workspaces
-- This trigger ensures that personal workspaces cannot have their time tracking
-- threshold configured, as this feature is only available for team workspaces.

-- Trigger function to prevent modification of missed_entry_date_threshold on personal workspaces
CREATE OR REPLACE FUNCTION prevent_personal_workspace_threshold_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the workspace is personal
  IF is_personal_workspace(NEW.ws_id) THEN
    -- On INSERT: ensure missed_entry_date_threshold is NULL for personal workspaces
    IF TG_OP = 'INSERT' THEN
      IF NEW.missed_entry_date_threshold IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot set missed_entry_date_threshold for personal workspaces. This feature is only available for team workspaces.';
      END IF;
    END IF;
    
    -- On UPDATE: prevent changing missed_entry_date_threshold from NULL to a value
    IF TG_OP = 'UPDATE' THEN
      -- Check if we're trying to set a non-NULL value
      IF NEW.missed_entry_date_threshold IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot set missed_entry_date_threshold for personal workspaces. This feature is only available for team workspaces.';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_personal_workspace_threshold_modification()
  IS 'Prevents setting missed_entry_date_threshold on personal workspaces. This time tracking restriction feature is only available for team workspaces.';

-- Create the trigger on workspace_settings table
DROP TRIGGER IF EXISTS check_personal_workspace_threshold ON workspace_settings;

CREATE TRIGGER check_personal_workspace_threshold
  BEFORE INSERT OR UPDATE ON workspace_settings
  FOR EACH ROW
  EXECUTE FUNCTION prevent_personal_workspace_threshold_modification();

COMMENT ON TRIGGER check_personal_workspace_threshold ON workspace_settings
  IS 'Enforces that personal workspaces cannot have missed_entry_date_threshold configured.';

-- Ensure any existing personal workspace settings have NULL threshold
-- (This is a data cleanup in case any personal workspace has a non-NULL value)
UPDATE workspace_settings ws
SET missed_entry_date_threshold = NULL
WHERE EXISTS (
  SELECT 1 FROM workspaces w 
  WHERE w.id = ws.ws_id 
  AND w.personal = true
)
AND ws.missed_entry_date_threshold IS NOT NULL;
