ALTER TABLE public.post_email_queue
    DROP CONSTRAINT IF EXISTS post_email_queue_status_check;

ALTER TABLE public.post_email_queue
    ADD CONSTRAINT post_email_queue_status_check CHECK (
        status IN (
            'queued',
            'processing',
            'sent',
            'failed',
            'blocked',
            'cancelled',
            'skipped'
        )
    );

COMMENT ON COLUMN public.post_email_queue.status IS 'Queue row lifecycle status. skipped = post exceeded the 7-day send window.';
