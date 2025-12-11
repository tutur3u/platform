-- Migration: Create email_audit table for centralized email tracking
-- Description: Unified audit logging for all external email sending

-- =============================================================================
-- email_audit table
-- =============================================================================

CREATE TABLE public.email_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

    -- Provider information
    provider TEXT NOT NULL DEFAULT 'ses',

    -- Sender information
    source_name TEXT NOT NULL,
    source_email TEXT NOT NULL,

    -- Recipients (stored as arrays)
    to_addresses TEXT[] NOT NULL,
    cc_addresses TEXT[] NOT NULL DEFAULT '{}',
    bcc_addresses TEXT[] NOT NULL DEFAULT '{}',
    reply_to_addresses TEXT[] NOT NULL DEFAULT '{}',

    -- Email content
    subject TEXT NOT NULL,
    content_hash TEXT,  -- SHA256 hash for deduplication (optional)

    -- Tracking metadata
    template_type TEXT,  -- 'workspace-invite', 'notification-digest', etc.
    entity_type TEXT,    -- 'notification', 'post', 'lead', etc.
    entity_id UUID,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'complained')),
    message_id TEXT,     -- Provider message ID (e.g., SES MessageId)
    error_message TEXT,

    -- Request context (for abuse tracking)
    ip_address TEXT,
    user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX idx_email_audit_ws_id ON public.email_audit(ws_id);
CREATE INDEX idx_email_audit_user_id ON public.email_audit(user_id) WHERE user_id IS NOT NULL;

-- Status and filtering
CREATE INDEX idx_email_audit_status ON public.email_audit(status);
CREATE INDEX idx_email_audit_created_at ON public.email_audit(created_at DESC);
CREATE INDEX idx_email_audit_template_type ON public.email_audit(template_type) WHERE template_type IS NOT NULL;

-- Entity reference lookup
CREATE INDEX idx_email_audit_entity ON public.email_audit(entity_type, entity_id)
    WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

-- Provider message ID lookup (for bounce/complaint processing)
CREATE INDEX idx_email_audit_message_id ON public.email_audit(message_id)
    WHERE message_id IS NOT NULL;

-- Combined index for common admin queries
CREATE INDEX idx_email_audit_ws_status_created ON public.email_audit(ws_id, status, created_at DESC);

-- =============================================================================
-- Updated at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_email_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_audit_updated_at
    BEFORE UPDATE ON public.email_audit
    FOR EACH ROW
    EXECUTE FUNCTION public.update_email_audit_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.email_audit ENABLE ROW LEVEL SECURITY;

-- Users with manage_workspace_audit_logs permission can view their workspace's email audit
CREATE POLICY "Users with audit permission can view email audit" ON public.email_audit
AS PERMISSIVE FOR SELECT TO authenticated
USING (
    public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_audit_logs')
);

-- Root workspace members can view all email audits (for system admin)
CREATE POLICY "Root workspace users can view all email audit" ON public.email_audit
AS PERMISSIVE FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
        AND wm.user_id = auth.uid()
    )
);

-- Service role has full access (for email service)
CREATE POLICY "Service role full access on email_audit" ON public.email_audit
AS PERMISSIVE FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Get email statistics for a workspace within a time period
CREATE OR REPLACE FUNCTION public.get_email_audit_stats(
    p_ws_id UUID,
    p_since TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '24 hours')
)
RETURNS TABLE (
    total BIGINT,
    sent BIGINT,
    failed BIGINT,
    bounced BIGINT,
    complained BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total,
        COUNT(*) FILTER (WHERE status = 'sent')::BIGINT AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed,
        COUNT(*) FILTER (WHERE status = 'bounced')::BIGINT AS bounced,
        COUNT(*) FILTER (WHERE status = 'complained')::BIGINT AS complained
    FROM public.email_audit
    WHERE ws_id = p_ws_id
    AND created_at >= p_since;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get email stats across all workspaces (for root admin)
CREATE OR REPLACE FUNCTION public.get_email_audit_stats_global(
    p_since TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '24 hours')
)
RETURNS TABLE (
    total BIGINT,
    sent BIGINT,
    failed BIGINT,
    bounced BIGINT,
    complained BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total,
        COUNT(*) FILTER (WHERE status = 'sent')::BIGINT AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed,
        COUNT(*) FILTER (WHERE status = 'bounced')::BIGINT AS bounced,
        COUNT(*) FILTER (WHERE status = 'complained')::BIGINT AS complained
    FROM public.email_audit
    WHERE created_at >= p_since;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE public.email_audit IS 'Centralized audit log for all external email sending';
COMMENT ON COLUMN public.email_audit.provider IS 'Email provider used (ses, sendgrid, postmark)';
COMMENT ON COLUMN public.email_audit.template_type IS 'Email template identifier (workspace-invite, notification-digest, etc.)';
COMMENT ON COLUMN public.email_audit.entity_type IS 'Type of entity this email relates to (notification, post, lead)';
COMMENT ON COLUMN public.email_audit.entity_id IS 'ID of the related entity for cross-referencing';
COMMENT ON COLUMN public.email_audit.message_id IS 'Provider-specific message ID for tracking bounces/complaints';
COMMENT ON COLUMN public.email_audit.content_hash IS 'SHA256 hash of email content for deduplication detection';
