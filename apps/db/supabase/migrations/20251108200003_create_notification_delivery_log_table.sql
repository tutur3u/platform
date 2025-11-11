-- Create notification delivery log table to track delivery attempts and batching
CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    channel TEXT NOT NULL, -- email, sms, push
    status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
    batch_id UUID, -- References notification_batches for batched deliveries
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add CHECK constraints to validate channel and status values
ALTER TABLE public.notification_delivery_log
    ADD CONSTRAINT notification_delivery_log_channel_check CHECK (channel IN ('email', 'sms', 'push')),
    ADD CONSTRAINT notification_delivery_log_status_check CHECK (status IN ('pending', 'sent', 'failed'));

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification ON public.notification_delivery_log(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_status ON public.notification_delivery_log(status, channel);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_batch ON public.notification_delivery_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_pending ON public.notification_delivery_log(status, created_at) WHERE status = 'pending';

-- Enable Row Level Security
ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view delivery logs for their own notifications
CREATE POLICY "Users can view their own delivery logs"
    ON public.notification_delivery_log
    FOR SELECT
    USING (
        notification_id IN (
            SELECT id FROM public.notifications WHERE user_id = auth.uid()
        )
    );

-- Policy: System can insert delivery logs
CREATE POLICY "System can insert delivery logs"
    ON public.notification_delivery_log
    FOR INSERT
    WITH CHECK (false);

-- Policy: System can update delivery logs
CREATE POLICY "System can update delivery logs"
    ON public.notification_delivery_log
    FOR UPDATE
    USING (false)
    WITH CHECK (false);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_notification_delivery_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_notification_delivery_log_updated_at
    BEFORE UPDATE ON public.notification_delivery_log
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notification_delivery_log_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.notification_delivery_log IS 'Tracks delivery attempts for notifications via different channels (email, SMS, push)';
COMMENT ON COLUMN public.notification_delivery_log.channel IS 'Delivery channel: email, sms, push';
COMMENT ON COLUMN public.notification_delivery_log.status IS 'Delivery status: pending, sent, failed';
COMMENT ON COLUMN public.notification_delivery_log.batch_id IS 'Reference to notification batch for grouped deliveries (10-minute window)';
COMMENT ON COLUMN public.notification_delivery_log.retry_count IS 'Number of retry attempts for failed deliveries';
