-- Rate Limits Admin Center — live write-usage view.
--
-- Exposes the current-window fixed-window WRITE counters that check_request()
-- maintains in private.rate_limit_counters, so the admin center can show live
-- consumption (who is near their cap). Service-role only.

CREATE OR REPLACE FUNCTION public.admin_list_rate_limit_counters(
    p_limit INTEGER DEFAULT 100,
    p_bucket_prefix TEXT DEFAULT NULL
)
RETURNS TABLE(
    bucket TEXT,
    window_seconds INTEGER,
    window_started_at TIMESTAMPTZ,
    current_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    SELECT
        c.bucket,
        c.window_seconds,
        c.window_started_at,
        c.current_count
    FROM private.rate_limit_counters c
    WHERE c.window_started_at + make_interval(secs => c.window_seconds) > NOW()
      AND (p_bucket_prefix IS NULL OR c.bucket LIKE p_bucket_prefix || '%')
    ORDER BY c.current_count DESC, c.window_started_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;

REVOKE ALL ON FUNCTION public.admin_list_rate_limit_counters(INTEGER, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_rate_limit_counters(INTEGER, TEXT)
    TO service_role;

COMMENT ON FUNCTION public.admin_list_rate_limit_counters(INTEGER, TEXT) IS
    'Service-role helper returning current-window write rate-limit counters for the rate limits admin center.';
