-- Track notification deliveries and batches that were skipped or consolidated
-- This supports send-time stale-task suppression and backlog consolidation.

ALTER TABLE public.notification_batches
    DROP CONSTRAINT IF EXISTS notification_batches_status_check;

ALTER TABLE public.notification_batches
    ADD COLUMN IF NOT EXISTS skip_reason TEXT,
    ADD COLUMN IF NOT EXISTS consolidated_into_batch_id UUID REFERENCES public.notification_batches(id) ON DELETE SET NULL,
    ADD CONSTRAINT notification_batches_status_check CHECK (
        status IN ('pending', 'processing', 'sent', 'failed', 'skipped')
    );

CREATE INDEX IF NOT EXISTS idx_notification_batches_consolidated_into
    ON public.notification_batches(consolidated_into_batch_id)
    WHERE consolidated_into_batch_id IS NOT NULL;

COMMENT ON COLUMN public.notification_batches.skip_reason IS
    'Reason a batch was skipped instead of sent (for example task_inactive or consolidated_to_latest_batch).';
COMMENT ON COLUMN public.notification_batches.consolidated_into_batch_id IS
    'If skipped because a newer pending batch superseded it, points to the batch that absorbed it.';

ALTER TABLE public.notification_delivery_log
    DROP CONSTRAINT IF EXISTS notification_delivery_log_status_check;

ALTER TABLE public.notification_delivery_log
    ADD COLUMN IF NOT EXISTS skip_reason TEXT,
    ADD COLUMN IF NOT EXISTS consolidated_into_notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
    ADD CONSTRAINT notification_delivery_log_status_check CHECK (
        status IN ('pending', 'sent', 'failed', 'skipped')
    );

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_consolidated_into
    ON public.notification_delivery_log(consolidated_into_notification_id)
    WHERE consolidated_into_notification_id IS NOT NULL;

COMMENT ON COLUMN public.notification_delivery_log.skip_reason IS
    'Reason a queued delivery was skipped instead of sent (for example deadline_elapsed or task_inactive).';
COMMENT ON COLUMN public.notification_delivery_log.consolidated_into_notification_id IS
    'If skipped because a newer notification superseded it, points to the notification that absorbed it.';
