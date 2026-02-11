-- IP Abuse Tracking Migration
-- Adds tables for tracking and blocking abusive IPs

-- 1. Create ENUM type for abuse event types
CREATE TYPE public.abuse_event_type AS ENUM (
    'otp_send',
    'otp_verify_failed',
    'mfa_challenge',
    'mfa_verify_failed',
    'reauth_send',
    'reauth_verify_failed',
    'password_login_failed',
    'manual'
);

-- 2. Create ENUM for block status
CREATE TYPE public.ip_block_status AS ENUM (
    'active',
    'expired',
    'manually_unblocked'
);

-- 3. Create the blocked IPs table (persistent storage for audit trail)
CREATE TABLE public.blocked_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    reason public.abuse_event_type NOT NULL,
    block_level INTEGER NOT NULL DEFAULT 1,
    status public.ip_block_status NOT NULL DEFAULT 'active',
    blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    unblocked_at TIMESTAMPTZ,
    unblocked_by UUID REFERENCES public.users(id),
    unblock_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create indexes for efficient IP lookups
CREATE INDEX idx_blocked_ips_ip_address ON public.blocked_ips(ip_address);
CREATE INDEX idx_blocked_ips_status ON public.blocked_ips(status);
CREATE INDEX idx_blocked_ips_expires_at ON public.blocked_ips(expires_at) WHERE status = 'active';
CREATE INDEX idx_blocked_ips_ip_status_expires ON public.blocked_ips(ip_address, status, expires_at);

-- 5. Create abuse events log table (for detailed audit trail)
CREATE TABLE public.abuse_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    event_type public.abuse_event_type NOT NULL,
    email_hash TEXT,
    user_agent TEXT,
    endpoint TEXT,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create indexes for efficient querying
CREATE INDEX idx_abuse_events_ip_address ON public.abuse_events(ip_address);
CREATE INDEX idx_abuse_events_created_at ON public.abuse_events(created_at DESC);
CREATE INDEX idx_abuse_events_ip_type_created ON public.abuse_events(ip_address, event_type, created_at DESC);
CREATE INDEX idx_abuse_events_event_type ON public.abuse_events(event_type);

-- 7. Create updated_at trigger for blocked_ips
CREATE TRIGGER update_blocked_ips_updated_at
BEFORE UPDATE ON public.blocked_ips
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Enable RLS
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_events ENABLE ROW LEVEL SECURITY;

-- 9. RLS policies - only root workspace users can manage blocked_ips
CREATE POLICY "Allow root workspace users to manage blocked_ips" ON public.blocked_ips
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.workspace_user_linked_users
        WHERE platform_user_id = auth.uid()
        AND ws_id = '00000000-0000-0000-0000-000000000000'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.workspace_user_linked_users
        WHERE platform_user_id = auth.uid()
        AND ws_id = '00000000-0000-0000-0000-000000000000'
    )
);

-- 10. RLS policy for abuse_events - only root workspace users can view
CREATE POLICY "Allow root workspace users to view abuse_events" ON public.abuse_events
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.workspace_user_linked_users
        WHERE platform_user_id = auth.uid()
        AND ws_id = '00000000-0000-0000-0000-000000000000'
    )
);

-- 11. Allow service role to insert abuse events (for server-side logging)
CREATE POLICY "Allow service role to insert abuse_events" ON public.abuse_events
AS PERMISSIVE FOR INSERT
TO service_role
WITH CHECK (true);

-- 12. Allow service role to manage blocked_ips (for automatic blocking)
CREATE POLICY "Allow service role to manage blocked_ips" ON public.blocked_ips
AS PERMISSIVE FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 13. Function to get active block for an IP
CREATE OR REPLACE FUNCTION public.get_active_ip_block(p_ip_address TEXT)
RETURNS TABLE (
    id UUID,
    block_level INTEGER,
    reason public.abuse_event_type,
    expires_at TIMESTAMPTZ,
    blocked_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.block_level,
        b.reason,
        b.expires_at,
        b.blocked_at
    FROM public.blocked_ips b
    WHERE b.ip_address = p_ip_address
    AND b.status = 'active'
    AND b.expires_at > NOW()
    ORDER BY b.expires_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. Function to get current block level for progressive blocking
CREATE OR REPLACE FUNCTION public.get_ip_block_level(p_ip_address TEXT)
RETURNS INTEGER AS $$
DECLARE
    max_level INTEGER;
BEGIN
    SELECT COALESCE(MAX(block_level), 0)
    INTO max_level
    FROM public.blocked_ips
    WHERE ip_address = p_ip_address
    AND blocked_at > NOW() - INTERVAL '24 hours';

    RETURN max_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 15. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_active_ip_block(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ip_block_level(TEXT) TO authenticated, service_role;

-- 16. Add comment documentation
COMMENT ON TABLE public.blocked_ips IS 'Tracks blocked IP addresses with progressive block durations for abuse prevention';
COMMENT ON TABLE public.abuse_events IS 'Audit log of abuse-related events for security monitoring';
COMMENT ON FUNCTION public.get_active_ip_block(TEXT) IS 'Returns active block information for an IP address if it exists';
COMMENT ON FUNCTION public.get_ip_block_level(TEXT) IS 'Returns the current progressive block level for an IP (0-4) based on blocks in last 24 hours';
