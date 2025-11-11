-- Create notification batches table to track smart batching windows (5-15 min)
CREATE TABLE IF NOT EXISTS public.notification_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    channel TEXT NOT NULL, -- email, sms
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, sent, failed
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    notification_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key constraint from notification_delivery_log.batch_id to this table
-- (notification_delivery_log was created in the previous migration before this table existed)
ALTER TABLE public.notification_delivery_log
    ADD CONSTRAINT notification_delivery_log_batch_id_fkey
        FOREIGN KEY (batch_id) REFERENCES public.notification_batches(id) ON DELETE CASCADE;

-- Add CHECK constraints to validate channel and status values
ALTER TABLE public.notification_batches
    ADD CONSTRAINT notification_batches_channel_check CHECK (channel IN ('email', 'sms', 'push')),
    ADD CONSTRAINT notification_batches_status_check CHECK (status IN ('pending', 'processing', 'sent', 'failed'));

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_batches_user ON public.notification_batches(user_id, ws_id);
CREATE INDEX IF NOT EXISTS idx_notification_batches_status ON public.notification_batches(status, window_end);
CREATE INDEX IF NOT EXISTS idx_notification_batches_pending ON public.notification_batches(status, window_end, channel) WHERE status = 'pending';

-- Enable Row Level Security
ALTER TABLE public.notification_batches ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own batches
CREATE POLICY "Users can view their own batches"
    ON public.notification_batches
    FOR SELECT
    USING (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Policy: System can manage batches
CREATE POLICY "System can manage batches"
    ON public.notification_batches
    FOR ALL
    USING (false)
    WITH CHECK (false);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_notification_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_notification_batches_updated_at
    BEFORE UPDATE ON public.notification_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notification_batches_updated_at();

-- Helper function to get or create a batch for smart batching
CREATE OR REPLACE FUNCTION public.get_or_create_notification_batch(
    p_ws_id UUID,
    p_user_id UUID,
    p_channel TEXT,
    p_window_minutes INTEGER DEFAULT 10
)
RETURNS UUID AS $$
DECLARE
    v_batch_id UUID;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
BEGIN
    -- Harden search_path to prevent privilege escalation
    SET LOCAL search_path = pg_temp, public;

    -- Try to find an existing pending batch within the window
    SELECT id INTO v_batch_id
    FROM public.notification_batches
    WHERE ws_id = p_ws_id
      AND user_id = p_user_id
      AND channel = p_channel
      AND status = 'pending'
      AND window_end > now()
    ORDER BY window_start DESC
    LIMIT 1;

    -- If no batch found, create a new one
    IF v_batch_id IS NULL THEN
        v_window_start := now();
        v_window_end := now() + (p_window_minutes || ' minutes')::interval;

        INSERT INTO public.notification_batches (
            ws_id,
            user_id,
            channel,
            window_start,
            window_end
        ) VALUES (
            p_ws_id,
            p_user_id,
            p_channel,
            v_window_start,
            v_window_end
        )
        RETURNING id INTO v_batch_id;
    END IF;

    RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE public.notification_batches IS 'Tracks batching windows for smart notification delivery (5-15 min delay to avoid spam)';
COMMENT ON COLUMN public.notification_batches.window_start IS 'When the batching window started';
COMMENT ON COLUMN public.notification_batches.window_end IS 'When the batching window ends and notifications should be sent';
COMMENT ON COLUMN public.notification_batches.notification_count IS 'Number of notifications grouped in this batch';
COMMENT ON FUNCTION public.get_or_create_notification_batch IS 'Gets an existing pending batch or creates a new one for smart batching';
