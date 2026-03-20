CREATE TABLE IF NOT EXISTS public.post_email_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    group_id uuid NOT NULL REFERENCES public.workspace_user_groups(id) ON DELETE CASCADE,
    post_id uuid NOT NULL REFERENCES public.user_group_posts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.workspace_users(id) ON DELETE CASCADE,
    sender_platform_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'queued',
    batch_id uuid,
    attempt_count integer NOT NULL DEFAULT 0,
    last_error text,
    blocked_reason text,
    claimed_at timestamptz,
    last_attempt_at timestamptz,
    sent_at timestamptz,
    cancelled_at timestamptz,
    sent_email_id uuid REFERENCES public.sent_emails(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT post_email_queue_status_check CHECK (
        status IN (
            'queued',
            'processing',
            'sent',
            'failed',
            'blocked',
            'cancelled'
        )
    ),
    CONSTRAINT post_email_queue_post_user_key UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_email_queue_ws_status_created_at
    ON public.post_email_queue(ws_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_post_email_queue_post_status
    ON public.post_email_queue(post_id, status);

CREATE INDEX IF NOT EXISTS idx_post_email_queue_group_status
    ON public.post_email_queue(group_id, status);

CREATE OR REPLACE FUNCTION public.update_post_email_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_post_email_queue_updated_at
ON public.post_email_queue;

CREATE TRIGGER update_post_email_queue_updated_at
    BEFORE UPDATE ON public.post_email_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.update_post_email_queue_updated_at();

ALTER TABLE public.post_email_queue ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.post_email_queue IS 'System-owned queue for post email deliveries.';
COMMENT ON COLUMN public.post_email_queue.sender_platform_user_id IS 'Platform user attributed as the sender when the system dispatches the email.';
COMMENT ON COLUMN public.post_email_queue.batch_id IS 'Processor-assigned batch identifier for a claimed set of queue rows.';
