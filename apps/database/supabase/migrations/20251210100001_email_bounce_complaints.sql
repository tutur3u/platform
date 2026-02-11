-- Migration: Create email_bounce_complaints table for reputation tracking
-- Description: Track email bounces and complaints for automatic blacklisting

-- =============================================================================
-- email_bounce_complaints table
-- =============================================================================

CREATE TABLE public.email_bounce_complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Hashed email for privacy (SHA256 substring)
    email_hash TEXT NOT NULL,

    -- Event type
    event_type TEXT NOT NULL CHECK (event_type IN ('bounce', 'complaint')),

    -- Bounce details (for bounces)
    bounce_type TEXT,        -- 'hard', 'soft', 'transient'
    bounce_subtype TEXT,     -- Provider-specific subtype

    -- Complaint details (for complaints)
    complaint_type TEXT,     -- 'abuse', 'auth-failure', 'fraud', etc.
    complaint_feedback_id TEXT,

    -- Reference to original email
    original_email_id UUID REFERENCES public.email_audit(id) ON DELETE SET NULL,

    -- Raw notification from provider (for debugging)
    raw_notification JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup by email hash
CREATE INDEX idx_email_bounce_complaints_email_hash
    ON public.email_bounce_complaints(email_hash);

-- Event type and date for analytics
CREATE INDEX idx_email_bounce_complaints_event_type
    ON public.email_bounce_complaints(event_type, created_at DESC);

-- Bounce type for filtering
CREATE INDEX idx_email_bounce_complaints_bounce_type
    ON public.email_bounce_complaints(bounce_type)
    WHERE bounce_type IS NOT NULL;

-- Original email reference
CREATE INDEX idx_email_bounce_complaints_original_email
    ON public.email_bounce_complaints(original_email_id)
    WHERE original_email_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.email_bounce_complaints ENABLE ROW LEVEL SECURITY;

-- Only root workspace users can view (for admin)
CREATE POLICY "Root workspace users can view bounces" ON public.email_bounce_complaints
AS PERMISSIVE FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
        AND wm.user_id = auth.uid()
    )
);

-- Service role has full access
CREATE POLICY "Service role full access on bounces" ON public.email_bounce_complaints
AS PERMISSIVE FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Check if an email has too many bounces (for reputation check)
CREATE OR REPLACE FUNCTION public.check_email_bounce_status(
    p_email_hash TEXT,
    p_window_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    is_blocked BOOLEAN,
    hard_bounce_count BIGINT,
    soft_bounce_count BIGINT,
    complaint_count BIGINT,
    block_reason TEXT
) AS $$
DECLARE
    v_hard_bounces BIGINT;
    v_soft_bounces BIGINT;
    v_complaints BIGINT;
    v_since TIMESTAMPTZ;
BEGIN
    v_since := NOW() - (p_window_days || ' days')::INTERVAL;

    -- Count different event types
    SELECT
        COUNT(*) FILTER (WHERE event_type = 'bounce' AND bounce_type = 'hard'),
        COUNT(*) FILTER (WHERE event_type = 'bounce' AND bounce_type IN ('soft', 'transient')),
        COUNT(*) FILTER (WHERE event_type = 'complaint')
    INTO v_hard_bounces, v_soft_bounces, v_complaints
    FROM public.email_bounce_complaints
    WHERE email_hash = p_email_hash
    AND created_at >= v_since;

    -- Determine if blocked
    IF v_hard_bounces > 0 THEN
        RETURN QUERY SELECT
            TRUE::BOOLEAN,
            v_hard_bounces,
            v_soft_bounces,
            v_complaints,
            'Hard bounce detected'::TEXT;
    ELSIF v_complaints > 0 THEN
        RETURN QUERY SELECT
            TRUE::BOOLEAN,
            v_hard_bounces,
            v_soft_bounces,
            v_complaints,
            'Spam complaint received'::TEXT;
    ELSIF v_soft_bounces >= 3 THEN
        RETURN QUERY SELECT
            TRUE::BOOLEAN,
            v_hard_bounces,
            v_soft_bounces,
            v_complaints,
            'Multiple soft bounces'::TEXT;
    ELSE
        RETURN QUERY SELECT
            FALSE::BOOLEAN,
            v_hard_bounces,
            v_soft_bounces,
            v_complaints,
            NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get bounce/complaint statistics for admin dashboard
CREATE OR REPLACE FUNCTION public.get_bounce_complaint_stats(
    p_since TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days')
)
RETURNS TABLE (
    total_events BIGINT,
    hard_bounces BIGINT,
    soft_bounces BIGINT,
    complaints BIGINT,
    unique_emails_affected BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total_events,
        COUNT(*) FILTER (WHERE event_type = 'bounce' AND bounce_type = 'hard')::BIGINT AS hard_bounces,
        COUNT(*) FILTER (WHERE event_type = 'bounce' AND bounce_type IN ('soft', 'transient'))::BIGINT AS soft_bounces,
        COUNT(*) FILTER (WHERE event_type = 'complaint')::BIGINT AS complaints,
        COUNT(DISTINCT email_hash)::BIGINT AS unique_emails_affected
    FROM public.email_bounce_complaints
    WHERE created_at >= p_since;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a bounce event
CREATE OR REPLACE FUNCTION public.record_email_bounce(
    p_email_hash TEXT,
    p_bounce_type TEXT,
    p_bounce_subtype TEXT DEFAULT NULL,
    p_original_email_id UUID DEFAULT NULL,
    p_raw_notification JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.email_bounce_complaints (
        email_hash,
        event_type,
        bounce_type,
        bounce_subtype,
        original_email_id,
        raw_notification
    ) VALUES (
        p_email_hash,
        'bounce',
        p_bounce_type,
        p_bounce_subtype,
        p_original_email_id,
        p_raw_notification
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a complaint event
CREATE OR REPLACE FUNCTION public.record_email_complaint(
    p_email_hash TEXT,
    p_complaint_type TEXT DEFAULT NULL,
    p_complaint_feedback_id TEXT DEFAULT NULL,
    p_original_email_id UUID DEFAULT NULL,
    p_raw_notification JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.email_bounce_complaints (
        email_hash,
        event_type,
        complaint_type,
        complaint_feedback_id,
        original_email_id,
        raw_notification
    ) VALUES (
        p_email_hash,
        'complaint',
        p_complaint_type,
        p_complaint_feedback_id,
        p_original_email_id,
        p_raw_notification
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE public.email_bounce_complaints IS 'Tracks email bounces and complaints for reputation management';
COMMENT ON COLUMN public.email_bounce_complaints.email_hash IS 'SHA256 hash (truncated) of the email address for privacy';
COMMENT ON COLUMN public.email_bounce_complaints.bounce_type IS 'Type of bounce: hard (permanent), soft (temporary), transient';
COMMENT ON COLUMN public.email_bounce_complaints.complaint_type IS 'Type of complaint: abuse, auth-failure, fraud, etc.';
COMMENT ON COLUMN public.email_bounce_complaints.raw_notification IS 'Raw notification payload from email provider (for debugging)';
