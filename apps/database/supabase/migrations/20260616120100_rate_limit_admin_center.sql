-- Rate Limits Admin Center — step 2 of 2: model + enforcement.
--
-- Extends abuse_trust_overrides into a general per-subject rate-limit rule:
--   * limit_mode: inherit_multiplier (default, today's behavior) | absolute
--     (exact per-window limits) | unlimited (bypass) | blocked (deny).
--   * absolute_limits JSONB: {"write":{minute,hour,day},"read":{minute,hour,day}}.
--   * trust_multiplier cap raised 5 -> 1000 so admins can "raise" beyond 5x.
-- Teaches get_rate_limit_trust_decision + check_request (DB WRITE path) and
-- list_trusted_subjects_for_cache (edge READ cache feed) to honor the new modes.
--
-- NOTE: check_request() is a PostgREST pre-request hook with no workspace
-- context, so 'workspace' rules are intentionally NOT enforced here — they are
-- enforced at the edge proxy (reads) and app API wrappers (reads/writes).

-- 1. New limit mode enum.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rate_limit_mode') THEN
        CREATE TYPE public.rate_limit_mode AS ENUM (
            'inherit_multiplier',
            'absolute',
            'unlimited',
            'blocked'
        );
    END IF;
END
$$;

-- 2. Extend the overrides table (additive; existing rows stay valid).
ALTER TABLE public.abuse_trust_overrides
    ALTER COLUMN trust_multiplier TYPE NUMERIC(6, 2);

ALTER TABLE public.abuse_trust_overrides
    ADD COLUMN IF NOT EXISTS limit_mode public.rate_limit_mode NOT NULL DEFAULT 'inherit_multiplier',
    ADD COLUMN IF NOT EXISTS absolute_limits JSONB;

ALTER TABLE public.abuse_trust_overrides
    DROP CONSTRAINT IF EXISTS abuse_trust_overrides_trust_multiplier_check;
ALTER TABLE public.abuse_trust_overrides
    ADD CONSTRAINT abuse_trust_overrides_trust_multiplier_check
        CHECK (trust_multiplier > 0 AND trust_multiplier <= 1000);

ALTER TABLE public.abuse_trust_overrides
    DROP CONSTRAINT IF EXISTS abuse_trust_overrides_absolute_limits_mode;
ALTER TABLE public.abuse_trust_overrides
    ADD CONSTRAINT abuse_trust_overrides_absolute_limits_mode
        CHECK (limit_mode <> 'absolute' OR absolute_limits IS NOT NULL);

COMMENT ON COLUMN public.abuse_trust_overrides.limit_mode IS
    'How the override applies: inherit_multiplier (scale base limits), absolute (exact per-window limits in absolute_limits), unlimited (bypass), blocked (deny).';
COMMENT ON COLUMN public.abuse_trust_overrides.absolute_limits IS
    'For limit_mode=absolute: {"write":{"minute":N,"hour":N,"day":N},"read":{...}}. Missing windows fall back to base limits.';

-- 3. Extend get_rate_limit_trust_decision to surface limit_mode + absolute_limits.
--    Return type changes, so drop dependents (public sql wrapper) then private.
DROP FUNCTION IF EXISTS public.get_rate_limit_trust_decision(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS private.get_rate_limit_trust_decision(UUID, INET, UUID);

CREATE FUNCTION private.get_rate_limit_trust_decision(
    p_user_id UUID DEFAULT NULL,
    p_ip INET DEFAULT NULL,
    p_api_key_id UUID DEFAULT NULL
)
RETURNS TABLE(
    tier public.abuse_risk_tier,
    trust_multiplier NUMERIC,
    decision_source TEXT,
    subject_key TEXT,
    limit_mode public.rate_limit_mode,
    absolute_limits JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_subject_keys TEXT[] := ARRAY[]::TEXT[];
    v_ip_text TEXT := CASE WHEN p_ip IS NULL THEN NULL ELSE p_ip::TEXT END;
BEGIN
    IF p_user_id IS NOT NULL THEN
        v_subject_keys := v_subject_keys || format('user:%s', p_user_id);
    END IF;

    IF p_api_key_id IS NOT NULL THEN
        v_subject_keys := v_subject_keys || format('api-key:%s', p_api_key_id);
    END IF;

    IF v_ip_text IS NOT NULL THEN
        v_subject_keys := v_subject_keys || format('ip:%s', v_ip_text);
        v_subject_keys := v_subject_keys || format(
            'cidr:%s',
            network(set_masklen(p_ip, CASE WHEN family(p_ip) = 4 THEN 24 ELSE 64 END))::TEXT
        );

        IF p_user_id IS NOT NULL THEN
            v_subject_keys := v_subject_keys || format('user-location:%s:%s', p_user_id, v_ip_text);
        END IF;
    END IF;

    IF array_length(v_subject_keys, 1) IS NULL THEN
        RETURN QUERY SELECT
            'standard'::public.abuse_risk_tier,
            1.00::NUMERIC,
            'default'::TEXT,
            NULL::TEXT,
            'inherit_multiplier'::public.rate_limit_mode,
            NULL::JSONB;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        o.tier,
        o.trust_multiplier,
        'override'::TEXT,
        o.subject_key,
        o.limit_mode,
        o.absolute_limits
    FROM public.abuse_trust_overrides o
    WHERE o.subject_key = ANY(v_subject_keys)
      AND o.revoked_at IS NULL
      AND (o.expires_at IS NULL OR o.expires_at > NOW())
    ORDER BY
        CASE o.tier
            WHEN 'restricted'::public.abuse_risk_tier THEN 1
            WHEN 'challenge_required'::public.abuse_risk_tier THEN 2
            WHEN 'watch'::public.abuse_risk_tier THEN 3
            WHEN 'trusted'::public.abuse_risk_tier THEN 4
            ELSE 5
        END,
        o.created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.tier,
        r.trust_multiplier,
        'reputation'::TEXT,
        r.subject_key,
        'inherit_multiplier'::public.rate_limit_mode,
        NULL::JSONB
    FROM public.abuse_reputation_subjects r
    WHERE r.subject_key = ANY(v_subject_keys)
    ORDER BY
        CASE r.tier
            WHEN 'restricted'::public.abuse_risk_tier THEN 1
            WHEN 'challenge_required'::public.abuse_risk_tier THEN 2
            WHEN 'watch'::public.abuse_risk_tier THEN 3
            WHEN 'trusted'::public.abuse_risk_tier THEN 4
            ELSE 5
        END,
        r.confidence_score DESC,
        r.last_seen_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY SELECT
        'standard'::public.abuse_risk_tier,
        1.00::NUMERIC,
        'default'::TEXT,
        NULL::TEXT,
        'inherit_multiplier'::public.rate_limit_mode,
        NULL::JSONB;
END;
$$;

REVOKE ALL ON FUNCTION private.get_rate_limit_trust_decision(UUID, INET, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_rate_limit_trust_decision(UUID, INET, UUID)
    TO service_role, authenticator;

CREATE FUNCTION public.get_rate_limit_trust_decision(
    p_user_id UUID DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_api_key_id UUID DEFAULT NULL
)
RETURNS TABLE(
    tier public.abuse_risk_tier,
    trust_multiplier NUMERIC,
    decision_source TEXT,
    subject_key TEXT,
    limit_mode public.rate_limit_mode,
    absolute_limits JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    SELECT *
    FROM private.get_rate_limit_trust_decision(
        p_user_id,
        private.safe_parse_inet(p_ip_address),
        p_api_key_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_rate_limit_trust_decision(UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rate_limit_trust_decision(UUID, TEXT, UUID)
    TO service_role;

-- 4. Teach check_request() to honor unlimited / blocked / absolute on writes.
CREATE OR REPLACE FUNCTION public.check_request()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_rate_windows INTERVAL[] := ARRAY[
        INTERVAL '1 minute',
        INTERVAL '1 hour',
        INTERVAL '1 day'
    ];
    v_window_keys TEXT[] := ARRAY['minute', 'hour', 'day'];
    v_authenticated_user_ip_limits INTEGER[] := ARRAY[20, 200, 800];
    v_authenticated_user_backstop_limits INTEGER[] := ARRAY[40, 400, 1500];
    v_anonymous_limits INTEGER[] := ARRAY[5, 50, 100];
    v_request_method TEXT := NULLIF(current_setting('request.method', true), '');
    v_request_path TEXT := COALESCE(NULLIF(current_setting('request.path', true), ''), 'unknown');
    v_request_role TEXT := COALESCE(NULLIF(current_setting('role', true), ''), 'unknown');
    v_headers_raw TEXT := NULLIF(current_setting('request.headers', true), '');
    v_jwt_raw TEXT := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), ''),
        NULLIF(current_setting('request.jwt', true), '')
    );
    v_is_read_only BOOLEAN := COALESCE(current_setting('transaction_read_only', true), 'off') = 'on';
    v_headers JSONB := '{}'::JSONB;
    v_jwt JSONB := '{}'::JSONB;
    v_user_id UUID;
    v_ip INET;
    v_allowed BOOLEAN;
    v_retry_after INTEGER;
    v_primary_bucket TEXT;
    v_secondary_bucket TEXT;
    v_rate_window INTERVAL;
    v_limit INTEGER;
    v_rate_window_index INTEGER;
    v_trust_multiplier NUMERIC := 1.00;
    v_limit_mode public.rate_limit_mode := 'inherit_multiplier';
    v_absolute_limits JSONB;
    v_abs_write JSONB;
BEGIN
    IF v_request_method IS NULL OR v_request_method IN ('GET', 'HEAD') THEN
        RETURN;
    END IF;

    IF v_request_role = 'service_role' OR v_is_read_only THEN
        RETURN;
    END IF;

    IF v_headers_raw IS NOT NULL THEN
        v_headers := v_headers_raw::JSONB;
    END IF;

    IF v_jwt_raw IS NOT NULL THEN
        v_jwt := v_jwt_raw::JSONB;
    END IF;

    BEGIN
        v_user_id := NULLIF(v_jwt ->> 'sub', '')::UUID;
    EXCEPTION
        WHEN OTHERS THEN
            v_user_id := NULL;
    END;

    v_ip := private.get_request_ip(v_headers);

    IF v_user_id IS NOT NULL THEN
        SELECT decision.trust_multiplier, decision.limit_mode, decision.absolute_limits
        INTO v_trust_multiplier, v_limit_mode, v_absolute_limits
        FROM private.get_rate_limit_trust_decision(v_user_id, v_ip, NULL) decision
        LIMIT 1;

        v_trust_multiplier := COALESCE(v_trust_multiplier, 1.00);
        v_limit_mode := COALESCE(v_limit_mode, 'inherit_multiplier');
        v_abs_write := v_absolute_limits -> 'write';

        -- Hard deny.
        IF v_limit_mode = 'blocked' THEN
            PERFORM private.raise_rate_limit_exceeded(60);
        END IF;

        -- Bypass all bucket consumption; still record the attempt below.
        IF v_limit_mode <> 'unlimited' THEN
            v_primary_bucket := format('user:%s', v_user_id);
            v_secondary_bucket := CASE
                WHEN v_ip IS NULL THEN NULL
                ELSE format('user-ip:%s:%s', v_user_id, v_ip)
            END;

            IF v_ip IS NOT NULL THEN
                FOR v_rate_window_index IN 1..array_length(v_rate_windows, 1) LOOP
                    v_rate_window := v_rate_windows[v_rate_window_index];
                    v_limit := CASE
                        WHEN v_limit_mode = 'absolute' THEN COALESCE(
                            NULLIF(v_abs_write ->> v_window_keys[v_rate_window_index], '')::INTEGER,
                            GREATEST(1, FLOOR(v_authenticated_user_ip_limits[v_rate_window_index] * v_trust_multiplier)::INTEGER)
                        )
                        ELSE GREATEST(1, FLOOR(v_authenticated_user_ip_limits[v_rate_window_index] * v_trust_multiplier)::INTEGER)
                    END;

                    SELECT allowed, retry_after
                    INTO v_allowed, v_retry_after
                    FROM private.try_consume_rate_limit_bucket(v_secondary_bucket, v_rate_window, v_limit);

                    IF NOT COALESCE(v_allowed, FALSE) THEN
                        PERFORM private.raise_rate_limit_exceeded(v_retry_after);
                    END IF;
                END LOOP;
            END IF;

            FOR v_rate_window_index IN 1..array_length(v_rate_windows, 1) LOOP
                v_rate_window := v_rate_windows[v_rate_window_index];
                v_limit := CASE
                    WHEN v_limit_mode = 'absolute' THEN COALESCE(
                        NULLIF(v_abs_write ->> v_window_keys[v_rate_window_index], '')::INTEGER,
                        GREATEST(1, FLOOR(v_authenticated_user_backstop_limits[v_rate_window_index] * v_trust_multiplier)::INTEGER)
                    )
                    ELSE GREATEST(1, FLOOR(v_authenticated_user_backstop_limits[v_rate_window_index] * v_trust_multiplier)::INTEGER)
                END;

                SELECT allowed, retry_after
                INTO v_allowed, v_retry_after
                FROM private.try_consume_rate_limit_bucket(v_primary_bucket, v_rate_window, v_limit);

                IF NOT COALESCE(v_allowed, FALSE) THEN
                    PERFORM private.raise_rate_limit_exceeded(v_retry_after);
                END IF;
            END LOOP;
        END IF;
    ELSE
        v_primary_bucket := CASE
            WHEN v_ip IS NULL THEN format('anonymous-role:%s', v_request_role)
            ELSE format('anonymous-role-ip:%s:%s', v_request_role, v_ip)
        END;

        FOR v_rate_window_index IN 1..array_length(v_rate_windows, 1) LOOP
            v_rate_window := v_rate_windows[v_rate_window_index];
            v_limit := v_anonymous_limits[v_rate_window_index];

            SELECT allowed, retry_after
            INTO v_allowed, v_retry_after
            FROM private.try_consume_rate_limit_bucket(v_primary_bucket, v_rate_window, v_limit);

            IF NOT COALESCE(v_allowed, FALSE) THEN
                PERFORM private.raise_rate_limit_exceeded(v_retry_after);
            END IF;
        END LOOP;
    END IF;

    PERFORM private.record_rate_limit_attempt(
        v_request_method,
        v_request_path,
        v_request_role,
        v_user_id,
        v_ip
    );
END;
$$;

COMMENT ON FUNCTION public.check_request() IS
    'PostgREST pre-request hook enforcing fixed-window write limits with server-side trust multipliers and admin rate-limit modes (unlimited/blocked/absolute). Reads are not limited here.';

-- 5. Feed the new modes to the edge READ cache reconciliation, and add the
--    'workspace' subject type (workspace rules uplift reads at the proxy).
DROP FUNCTION IF EXISTS public.list_trusted_subjects_for_cache(NUMERIC);

CREATE FUNCTION public.list_trusted_subjects_for_cache(
    p_min_multiplier NUMERIC DEFAULT 1.01
)
RETURNS TABLE(
    subject_key TEXT,
    trust_multiplier NUMERIC,
    limit_mode public.rate_limit_mode,
    absolute_limits JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    SELECT DISTINCT ON (combined.subject_key)
        combined.subject_key,
        combined.trust_multiplier,
        combined.limit_mode,
        combined.absolute_limits
    FROM (
        SELECT
            o.subject_key,
            o.trust_multiplier,
            o.limit_mode,
            o.absolute_limits,
            1 AS priority
        FROM public.abuse_trust_overrides o
        WHERE o.revoked_at IS NULL
          AND (o.expires_at IS NULL OR o.expires_at > NOW())
          AND o.subject_type IN ('session', 'cidr', 'ip', 'workspace')
          AND (
              o.trust_multiplier > p_min_multiplier
              OR o.limit_mode IN ('absolute', 'unlimited')
          )
        UNION ALL
        SELECT
            r.subject_key,
            r.trust_multiplier,
            'inherit_multiplier'::public.rate_limit_mode,
            NULL::JSONB,
            2 AS priority
        FROM public.abuse_reputation_subjects r
        WHERE r.subject_type IN ('session', 'cidr', 'ip')
          AND r.trust_multiplier > p_min_multiplier
    ) combined
    ORDER BY combined.subject_key, combined.priority, combined.trust_multiplier DESC;
$$;

REVOKE ALL ON FUNCTION public.list_trusted_subjects_for_cache(NUMERIC)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_trusted_subjects_for_cache(NUMERIC)
    TO service_role;

COMMENT ON FUNCTION public.list_trusted_subjects_for_cache(NUMERIC) IS
    'Service-role helper returning elevated/absolute/unlimited session/cidr/ip/workspace subjects (overrides preferred over reputation) for reconciling the edge read-limit trust cache.';
