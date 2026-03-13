-- Prefer explicit Cloudflare client IP headers over generic forwarded chains
-- so PostgREST rate limiting keys on the real caller in
-- Cloudflare -> Vercel -> Supabase deployments.

CREATE OR REPLACE FUNCTION private.get_request_ip(p_headers JSONB)
RETURNS INET
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT COALESCE(
        private.safe_parse_inet(p_headers ->> 'cf-connecting-ip'),
        private.safe_parse_inet(p_headers ->> 'CF-Connecting-IP'),
        private.safe_parse_inet(p_headers ->> 'true-client-ip'),
        private.safe_parse_inet(p_headers ->> 'True-Client-IP'),
        private.safe_parse_inet(p_headers ->> 'x-forwarded-for'),
        private.safe_parse_inet(p_headers ->> 'X-Forwarded-For'),
        private.safe_parse_inet(p_headers ->> 'x-real-ip'),
        private.safe_parse_inet(p_headers ->> 'X-Real-IP')
    );
$$;

COMMENT ON FUNCTION private.get_request_ip(JSONB) IS
    'Extracts the best-effort client IP from request headers, prioritizing Cloudflare client-IP headers before generic proxy chains.';
