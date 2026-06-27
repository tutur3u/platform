-- Rate-limit appeals and admin review workflow.
--
-- Appeals are submitted by authenticated users who pass Turnstile while their
-- IP is hard-blocked. They can receive a short session+IP Redis relief window,
-- but this table is the durable review/audit trail. Admin approval may clear the
-- active IP block and create a time-bound workspace trust rule.

CREATE TABLE IF NOT EXISTS public.rate_limit_appeals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    client_ip TEXT NOT NULL,
    user_email TEXT,
    user_agent TEXT,
    timezone TEXT,
    page_path TEXT,
    request_path TEXT,
    request_method TEXT,
    response_status INTEGER,
    proxy_block_reason TEXT,
    rate_limit_policy TEXT,
    rate_limit_window TEXT,
    retry_after_seconds INTEGER,
    diagnostics JSONB NOT NULL DEFAULT '{}'::JSONB,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    turnstile_verified_at TIMESTAMPTZ,
    temporary_relief_granted_at TIMESTAMPTZ,
    temporary_relief_expires_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    cleared_blocked_ip_id UUID REFERENCES public.blocked_ips(id) ON DELETE SET NULL,
    created_rate_limit_rule_id UUID REFERENCES public.abuse_trust_overrides(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rate_limit_appeals_status_check CHECK (
        status IN ('pending', 'approved', 'rejected', 'closed')
    ),
    CONSTRAINT rate_limit_appeals_client_ip_length_check CHECK (
        octet_length(client_ip) <= 512
    ),
    CONSTRAINT rate_limit_appeals_user_email_length_check CHECK (
        user_email IS NULL OR octet_length(user_email) <= 1280
    ),
    CONSTRAINT rate_limit_appeals_message_length_check CHECK (
        message IS NULL OR octet_length(message) <= 2000
    ),
    CONSTRAINT rate_limit_appeals_review_note_length_check CHECK (
        review_note IS NULL OR octet_length(review_note) <= 2000
    )
);

ALTER TABLE public.rate_limit_appeals ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS rate_limit_appeals_updated_at ON public.rate_limit_appeals;
CREATE TRIGGER rate_limit_appeals_updated_at
    BEFORE UPDATE ON public.rate_limit_appeals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS rate_limit_appeals_status_created_at_idx
    ON public.rate_limit_appeals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS rate_limit_appeals_creator_ip_workspace_idx
    ON public.rate_limit_appeals (
        creator_id,
        client_ip,
        COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::UUID)
    );

CREATE UNIQUE INDEX IF NOT EXISTS rate_limit_appeals_active_dedupe_idx
    ON public.rate_limit_appeals (
        creator_id,
        client_ip,
        COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::UUID)
    )
    WHERE status = 'pending';

CREATE POLICY "Users can read their own rate-limit appeals"
    ON public.rate_limit_appeals
    FOR SELECT
    TO authenticated
    USING (creator_id = auth.uid());

CREATE POLICY "Users can create their own rate-limit appeals"
    ON public.rate_limit_appeals
    FOR INSERT
    TO authenticated
    WITH CHECK (creator_id = auth.uid());

GRANT SELECT, INSERT ON TABLE public.rate_limit_appeals TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
    ON TABLE public.rate_limit_appeals TO service_role;

COMMENT ON TABLE public.rate_limit_appeals IS
    'Authenticated, Turnstile-verified requests for review of active rate-limit/IP blocks.';
COMMENT ON COLUMN public.rate_limit_appeals.diagnostics IS
    'Bounded sanitized client-captured rate-limit diagnostics; no cookies, auth headers, or request bodies.';
COMMENT ON COLUMN public.rate_limit_appeals.temporary_relief_expires_at IS
    'Short session+IP relief expiry. Does not indicate the global IP block was cleared.';
COMMENT ON COLUMN public.rate_limit_appeals.created_rate_limit_rule_id IS
    'Workspace trust/rate-limit rule created by admin approval, when applicable.';
