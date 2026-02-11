-- Create notification preferences table for user-controlled notification settings
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    event_type TEXT NOT NULL, -- task_assigned, task_updated, task_mention, workspace_invite, etc.
    channel TEXT NOT NULL, -- web, email, sms, push
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(ws_id, user_id, event_type, channel)
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON public.notification_preferences(user_id, ws_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_enabled ON public.notification_preferences(user_id, event_type, channel, enabled);

-- Enable Row Level Security
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own preferences
CREATE POLICY "Users can view their own preferences"
    ON public.notification_preferences
    FOR SELECT
    USING (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can insert their own preferences
CREATE POLICY "Users can insert their own preferences"
    ON public.notification_preferences
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update their own preferences"
    ON public.notification_preferences
    FOR UPDATE
    USING (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can delete their own preferences
CREATE POLICY "Users can delete their own preferences"
    ON public.notification_preferences
    FOR DELETE
    USING (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notification_preferences_updated_at();

-- Helper function to check if a notification should be sent based on user preferences
CREATE OR REPLACE FUNCTION public.should_send_notification(
    p_ws_id UUID,
    p_user_id UUID,
    p_event_type TEXT,
    p_channel TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_preference BOOLEAN;
BEGIN
    -- Harden search_path to prevent privilege escalation
    SET LOCAL search_path = pg_temp, public;

    -- Check if user has explicitly set a preference
    SELECT enabled INTO v_preference
    FROM public.notification_preferences
    WHERE ws_id = p_ws_id
      AND user_id = p_user_id
      AND event_type = p_event_type
      AND channel = p_channel;

    -- If no preference found, default to true (enabled)
    RETURN COALESCE(v_preference, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE public.notification_preferences IS 'User preferences for notification channels and event types per workspace';
COMMENT ON COLUMN public.notification_preferences.event_type IS 'Type of event: task_assigned, task_updated, task_mention, workspace_invite';
COMMENT ON COLUMN public.notification_preferences.channel IS 'Delivery channel: web, email, sms, push';
COMMENT ON COLUMN public.notification_preferences.enabled IS 'Whether notifications are enabled for this combination';
COMMENT ON FUNCTION public.should_send_notification IS 'Helper function to check if a notification should be sent based on user preferences. Defaults to true if no preference is set.';
