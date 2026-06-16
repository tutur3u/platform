-- Trust cache reconciliation helper.
--
-- The edge proxy guard scales READ rate limits up for trusted accounts and
-- trusted locations by reading a Redis cache of per-subject trust multipliers.
-- This service-role-only function lets the `sync-trust-cache` cron reconcile
-- that cache from the authoritative reputation/override tables, so that:
--   * admin-managed trusted locations (cidr overrides) take effect for reads
--     without waiting for organic traffic to trigger app-layer write-through, and
--   * elevated reputation subjects refresh before their cache TTL expires.
--
-- Only the subject types the edge actually reads for read uplift
-- (session, cidr, ip) are returned, and only genuinely elevated subjects
-- (multiplier above the neutral baseline). Restrictive decisions are enforced
-- server-side and are intentionally never relaxed at the read edge.

CREATE OR REPLACE FUNCTION public.list_trusted_subjects_for_cache(
    p_min_multiplier NUMERIC DEFAULT 1.01
)
RETURNS TABLE(
    subject_key TEXT,
    trust_multiplier NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    WITH active_overrides AS (
        SELECT o.subject_key, o.trust_multiplier
        FROM public.abuse_trust_overrides o
        WHERE o.revoked_at IS NULL
          AND (o.expires_at IS NULL OR o.expires_at > NOW())
          AND o.subject_type IN ('session', 'cidr', 'ip')
          AND o.trust_multiplier > p_min_multiplier
    ),
    reputation AS (
        SELECT r.subject_key, r.trust_multiplier
        FROM public.abuse_reputation_subjects r
        WHERE r.subject_type IN ('session', 'cidr', 'ip')
          AND r.trust_multiplier > p_min_multiplier
    ),
    combined AS (
        SELECT subject_key, trust_multiplier FROM active_overrides
        UNION ALL
        SELECT subject_key, trust_multiplier FROM reputation
    )
    SELECT
        combined.subject_key,
        MAX(combined.trust_multiplier) AS trust_multiplier
    FROM combined
    GROUP BY combined.subject_key;
$$;

REVOKE ALL ON FUNCTION public.list_trusted_subjects_for_cache(NUMERIC)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_trusted_subjects_for_cache(NUMERIC)
    TO service_role;

COMMENT ON FUNCTION public.list_trusted_subjects_for_cache(NUMERIC) IS
    'Service-role helper returning elevated session/cidr/ip subject keys and trust multipliers (including active trusted-location cidr overrides) for reconciling the edge read-limit trust cache.';
