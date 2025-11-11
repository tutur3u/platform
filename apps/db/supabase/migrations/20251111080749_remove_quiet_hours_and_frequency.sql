-- Remove quiet hours and digest frequency settings from notification_preferences
-- This migration removes the advanced notification settings feature

-- Drop the columns from notification_preferences table
ALTER TABLE public.notification_preferences
  DROP COLUMN IF EXISTS digest_frequency,
  DROP COLUMN IF EXISTS quiet_hours_start,
  DROP COLUMN IF EXISTS quiet_hours_end,
  DROP COLUMN IF EXISTS timezone;

-- Update should_send_notification function to remove quiet hours logic
CREATE OR REPLACE FUNCTION public.should_send_notification(
  p_user_id UUID,
  p_event_type TEXT,
  p_channel TEXT,
  p_scope public.notification_scope DEFAULT 'workspace',
  p_ws_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_preference BOOLEAN;
BEGIN
  -- Check for workspace-specific preference first
  IF p_scope = 'workspace' AND p_ws_id IS NOT NULL THEN
    SELECT enabled
    INTO v_preference
    FROM public.notification_preferences
    WHERE user_id = p_user_id
      AND ws_id = p_ws_id
      AND event_type = p_event_type
      AND channel = p_channel
      AND scope = 'workspace';
  END IF;

  -- Fall back to user-level preference if no workspace preference
  IF v_preference IS NULL THEN
    SELECT enabled
    INTO v_preference
    FROM public.notification_preferences
    WHERE user_id = p_user_id
      AND ws_id IS NULL
      AND event_type = p_event_type
      AND channel = p_channel
      AND scope IN ('user', 'system');
  END IF;

  -- Default to enabled if no preference found
  RETURN COALESCE(v_preference, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
