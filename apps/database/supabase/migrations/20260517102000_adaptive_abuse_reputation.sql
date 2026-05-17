-- Adaptive abuse reputation and trusted-rate-limit controls.
-- This is intentionally server-side state: open-source clients must not be
-- able to gain trust by replaying static headers or request shapes.

CREATE TYPE public.abuse_reputation_subject_type AS ENUM (
    'user',
    'session',
    'api_key',
    'ip',
    'cidr',
    'user_location'
);

CREATE TYPE public.abuse_risk_tier AS ENUM (
    'trusted',
    'standard',
    'watch',
    'challenge_required',
    'restricted'
);

CREATE TYPE public.abuse_signal_type AS ENUM (
    'organic_activity',
    'automation_client',
    'scripted_client',
    'missing_user_agent',
    'auth_failure',
    'rate_limit_hit',
    'client_error',
    'payload_abuse',
    'challenge_issued',
    'challenge_passed',
    'challenge_failed',
    'manual_override'
);

CREATE TYPE public.abuse_challenge_status AS ENUM (
    'issued',
    'passed',
    'failed',
    'expired'
);

CREATE TABLE public.abuse_reputation_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type public.abuse_reputation_subject_type NOT NULL,
    subject_key TEXT NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    ip_address TEXT,
    cidr TEXT,
    api_key_id UUID REFERENCES public.workspace_api_keys(id) ON DELETE SET NULL,
    reputation_score INTEGER NOT NULL DEFAULT 50 CHECK (reputation_score BETWEEN 0 AND 100),
    confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
    tier public.abuse_risk_tier NOT NULL DEFAULT 'standard',
    trust_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (trust_multiplier > 0 AND trust_multiplier <= 5),
    positive_signal_count INTEGER NOT NULL DEFAULT 0,
    negative_signal_count INTEGER NOT NULL DEFAULT 0,
    last_positive_signal_at TIMESTAMPTZ,
    last_negative_signal_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subject_type, subject_key)
);

CREATE INDEX idx_abuse_reputation_subjects_tier_seen
    ON public.abuse_reputation_subjects(tier, last_seen_at DESC);
CREATE INDEX idx_abuse_reputation_subjects_user_seen
    ON public.abuse_reputation_subjects(user_id, last_seen_at DESC)
    WHERE user_id IS NOT NULL;
CREATE INDEX idx_abuse_reputation_subjects_ip_seen
    ON public.abuse_reputation_subjects(ip_address, last_seen_at DESC)
    WHERE ip_address IS NOT NULL;
CREATE INDEX idx_abuse_reputation_subjects_api_key_seen
    ON public.abuse_reputation_subjects(api_key_id, last_seen_at DESC)
    WHERE api_key_id IS NOT NULL;

CREATE TABLE public.abuse_activity_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type public.abuse_reputation_subject_type NOT NULL,
    subject_key TEXT NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    ip_address TEXT,
    api_key_id UUID REFERENCES public.workspace_api_keys(id) ON DELETE SET NULL,
    route TEXT,
    method TEXT,
    signal_type public.abuse_signal_type NOT NULL,
    score_delta INTEGER NOT NULL DEFAULT 0,
    confidence_delta INTEGER NOT NULL DEFAULT 0,
    risk_tier public.abuse_risk_tier NOT NULL DEFAULT 'standard',
    reason_code TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_abuse_activity_signals_created_at
    ON public.abuse_activity_signals(created_at DESC);
CREATE INDEX idx_abuse_activity_signals_subject_created
    ON public.abuse_activity_signals(subject_type, subject_key, created_at DESC);
CREATE INDEX idx_abuse_activity_signals_user_created
    ON public.abuse_activity_signals(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;
CREATE INDEX idx_abuse_activity_signals_ip_created
    ON public.abuse_activity_signals(ip_address, created_at DESC)
    WHERE ip_address IS NOT NULL;
CREATE INDEX idx_abuse_activity_signals_type_created
    ON public.abuse_activity_signals(signal_type, created_at DESC);

CREATE TABLE public.abuse_step_up_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    subject_key TEXT NOT NULL,
    ip_address TEXT,
    route TEXT,
    challenge_type TEXT NOT NULL DEFAULT 'turnstile',
    status public.abuse_challenge_status NOT NULL DEFAULT 'issued',
    risk_tier public.abuse_risk_tier NOT NULL DEFAULT 'challenge_required',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_abuse_step_up_challenges_user_created
    ON public.abuse_step_up_challenges(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;
CREATE INDEX idx_abuse_step_up_challenges_subject_created
    ON public.abuse_step_up_challenges(subject_key, created_at DESC);
CREATE INDEX idx_abuse_step_up_challenges_status_expires
    ON public.abuse_step_up_challenges(status, expires_at);

CREATE TABLE public.abuse_trust_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type public.abuse_reputation_subject_type NOT NULL,
    subject_key TEXT NOT NULL,
    tier public.abuse_risk_tier NOT NULL,
    trust_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (trust_multiplier > 0 AND trust_multiplier <= 5),
    reason TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    revoke_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_abuse_trust_overrides_subject_created
    ON public.abuse_trust_overrides(subject_type, subject_key, created_at DESC);
CREATE INDEX idx_abuse_trust_overrides_active_subject
    ON public.abuse_trust_overrides(subject_type, subject_key, expires_at)
    WHERE revoked_at IS NULL;

CREATE TRIGGER update_abuse_reputation_subjects_updated_at
BEFORE UPDATE ON public.abuse_reputation_subjects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_abuse_step_up_challenges_updated_at
BEFORE UPDATE ON public.abuse_step_up_challenges
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_abuse_trust_overrides_updated_at
BEFORE UPDATE ON public.abuse_trust_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.abuse_reputation_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_activity_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_step_up_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_trust_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow root workspace users to view abuse reputation subjects"
ON public.abuse_reputation_subjects
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

CREATE POLICY "Allow root workspace users to view abuse activity signals"
ON public.abuse_activity_signals
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

CREATE POLICY "Allow root workspace users to view abuse challenges"
ON public.abuse_step_up_challenges
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

CREATE POLICY "Allow root workspace users to manage abuse trust overrides"
ON public.abuse_trust_overrides
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

CREATE POLICY "Allow service role to manage abuse reputation subjects"
ON public.abuse_reputation_subjects
AS PERMISSIVE FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role to manage abuse activity signals"
ON public.abuse_activity_signals
AS PERMISSIVE FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role to manage abuse challenges"
ON public.abuse_step_up_challenges
AS PERMISSIVE FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role to manage abuse trust overrides"
ON public.abuse_trust_overrides
AS PERMISSIVE FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION private.clamp_abuse_score(p_value INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT LEAST(100, GREATEST(0, COALESCE(p_value, 0)));
$$;

CREATE OR REPLACE FUNCTION private.compute_abuse_risk_tier(
    p_score INTEGER,
    p_confidence INTEGER
)
RETURNS public.abuse_risk_tier
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT CASE
        WHEN p_score <= 15 AND p_confidence >= 20 THEN 'restricted'::public.abuse_risk_tier
        WHEN p_score <= 30 AND p_confidence >= 20 THEN 'challenge_required'::public.abuse_risk_tier
        WHEN p_score <= 45 AND p_confidence >= 10 THEN 'watch'::public.abuse_risk_tier
        WHEN p_score >= 80 AND p_confidence >= 60 THEN 'trusted'::public.abuse_risk_tier
        ELSE 'standard'::public.abuse_risk_tier
    END;
$$;

CREATE OR REPLACE FUNCTION private.abuse_trust_multiplier_for_tier(
    p_tier public.abuse_risk_tier
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT CASE p_tier
        WHEN 'trusted'::public.abuse_risk_tier THEN 3.00
        WHEN 'watch'::public.abuse_risk_tier THEN 0.75
        WHEN 'challenge_required'::public.abuse_risk_tier THEN 1.00
        WHEN 'restricted'::public.abuse_risk_tier THEN 0.35
        ELSE 1.00
    END;
$$;

CREATE OR REPLACE FUNCTION public.record_abuse_activity_signal(
    p_subjects JSONB,
    p_signal_type public.abuse_signal_type,
    p_score_delta INTEGER DEFAULT 0,
    p_confidence_delta INTEGER DEFAULT 0,
    p_user_id UUID DEFAULT NULL,
    p_workspace_id UUID DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_api_key_id UUID DEFAULT NULL,
    p_route TEXT DEFAULT NULL,
    p_method TEXT DEFAULT NULL,
    p_risk_tier public.abuse_risk_tier DEFAULT 'standard',
    p_reason_code TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_subject JSONB;
    v_subject_type public.abuse_reputation_subject_type;
    v_subject_key TEXT;
    v_next_score INTEGER;
    v_next_confidence INTEGER;
    v_next_tier public.abuse_risk_tier;
    v_positive BOOLEAN := COALESCE(p_score_delta, 0) >= 0;
BEGIN
    IF jsonb_typeof(COALESCE(p_subjects, '[]'::JSONB)) <> 'array' THEN
        RETURN;
    END IF;

    FOR v_subject IN SELECT * FROM jsonb_array_elements(p_subjects) LOOP
        BEGIN
            v_subject_type := (v_subject ->> 'subject_type')::public.abuse_reputation_subject_type;
            v_subject_key := NULLIF(BTRIM(v_subject ->> 'subject_key'), '');
        EXCEPTION
            WHEN OTHERS THEN
                CONTINUE;
        END;

        IF v_subject_key IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.abuse_activity_signals (
            subject_type,
            subject_key,
            user_id,
            workspace_id,
            ip_address,
            api_key_id,
            route,
            method,
            signal_type,
            score_delta,
            confidence_delta,
            risk_tier,
            reason_code,
            metadata
        )
        VALUES (
            v_subject_type,
            v_subject_key,
            p_user_id,
            p_workspace_id,
            p_ip_address,
            p_api_key_id,
            p_route,
            p_method,
            p_signal_type,
            COALESCE(p_score_delta, 0),
            COALESCE(p_confidence_delta, 0),
            COALESCE(p_risk_tier, 'standard'::public.abuse_risk_tier),
            p_reason_code,
            COALESCE(p_metadata, '{}'::JSONB)
        );

        v_next_score := private.clamp_abuse_score(50 + COALESCE(p_score_delta, 0));
        v_next_confidence := private.clamp_abuse_score(COALESCE(p_confidence_delta, 0));
        v_next_tier := private.compute_abuse_risk_tier(v_next_score, v_next_confidence);

        INSERT INTO public.abuse_reputation_subjects (
            subject_type,
            subject_key,
            user_id,
            workspace_id,
            ip_address,
            cidr,
            api_key_id,
            reputation_score,
            confidence_score,
            tier,
            trust_multiplier,
            positive_signal_count,
            negative_signal_count,
            last_positive_signal_at,
            last_negative_signal_at,
            last_seen_at,
            metadata
        )
        VALUES (
            v_subject_type,
            v_subject_key,
            p_user_id,
            p_workspace_id,
            CASE WHEN v_subject_type IN ('ip', 'user_location') THEN p_ip_address ELSE NULL END,
            CASE WHEN v_subject_type = 'cidr' THEN v_subject_key ELSE NULL END,
            p_api_key_id,
            v_next_score,
            v_next_confidence,
            v_next_tier,
            private.abuse_trust_multiplier_for_tier(v_next_tier),
            CASE WHEN v_positive THEN 1 ELSE 0 END,
            CASE WHEN v_positive THEN 0 ELSE 1 END,
            CASE WHEN v_positive THEN NOW() ELSE NULL END,
            CASE WHEN v_positive THEN NULL ELSE NOW() END,
            NOW(),
            jsonb_build_object('last_reason_code', p_reason_code, 'last_signal_type', p_signal_type)
        )
        ON CONFLICT (subject_type, subject_key)
        DO UPDATE
        SET
            user_id = COALESCE(EXCLUDED.user_id, public.abuse_reputation_subjects.user_id),
            workspace_id = COALESCE(EXCLUDED.workspace_id, public.abuse_reputation_subjects.workspace_id),
            ip_address = COALESCE(EXCLUDED.ip_address, public.abuse_reputation_subjects.ip_address),
            cidr = COALESCE(EXCLUDED.cidr, public.abuse_reputation_subjects.cidr),
            api_key_id = COALESCE(EXCLUDED.api_key_id, public.abuse_reputation_subjects.api_key_id),
            reputation_score = private.clamp_abuse_score(
                public.abuse_reputation_subjects.reputation_score + COALESCE(p_score_delta, 0)
            ),
            confidence_score = private.clamp_abuse_score(
                public.abuse_reputation_subjects.confidence_score + ABS(COALESCE(p_confidence_delta, 0))
            ),
            tier = private.compute_abuse_risk_tier(
                private.clamp_abuse_score(public.abuse_reputation_subjects.reputation_score + COALESCE(p_score_delta, 0)),
                private.clamp_abuse_score(public.abuse_reputation_subjects.confidence_score + ABS(COALESCE(p_confidence_delta, 0)))
            ),
            trust_multiplier = private.abuse_trust_multiplier_for_tier(
                private.compute_abuse_risk_tier(
                    private.clamp_abuse_score(public.abuse_reputation_subjects.reputation_score + COALESCE(p_score_delta, 0)),
                    private.clamp_abuse_score(public.abuse_reputation_subjects.confidence_score + ABS(COALESCE(p_confidence_delta, 0)))
                )
            ),
            positive_signal_count = public.abuse_reputation_subjects.positive_signal_count + CASE WHEN v_positive THEN 1 ELSE 0 END,
            negative_signal_count = public.abuse_reputation_subjects.negative_signal_count + CASE WHEN v_positive THEN 0 ELSE 1 END,
            last_positive_signal_at = CASE WHEN v_positive THEN NOW() ELSE public.abuse_reputation_subjects.last_positive_signal_at END,
            last_negative_signal_at = CASE WHEN v_positive THEN public.abuse_reputation_subjects.last_negative_signal_at ELSE NOW() END,
            last_seen_at = NOW(),
            metadata = public.abuse_reputation_subjects.metadata || EXCLUDED.metadata,
            updated_at = NOW();
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.get_rate_limit_trust_decision(
    p_user_id UUID DEFAULT NULL,
    p_ip INET DEFAULT NULL,
    p_api_key_id UUID DEFAULT NULL
)
RETURNS TABLE(
    tier public.abuse_risk_tier,
    trust_multiplier NUMERIC,
    decision_source TEXT,
    subject_key TEXT
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
        RETURN QUERY SELECT 'standard'::public.abuse_risk_tier, 1.00::NUMERIC, 'default'::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        o.tier,
        o.trust_multiplier,
        'override'::TEXT,
        o.subject_key
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
        r.subject_key
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

    RETURN QUERY SELECT 'standard'::public.abuse_risk_tier, 1.00::NUMERIC, 'default'::TEXT, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_abuse_activity_signal(JSONB, public.abuse_signal_type, INTEGER, INTEGER, UUID, UUID, TEXT, UUID, TEXT, TEXT, public.abuse_risk_tier, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.record_abuse_activity_signal(JSONB, public.abuse_signal_type, INTEGER, INTEGER, UUID, UUID, TEXT, UUID, TEXT, TEXT, public.abuse_risk_tier, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.get_rate_limit_trust_decision(UUID, INET, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_rate_limit_trust_decision(UUID, INET, UUID) TO service_role, authenticator;

CREATE OR REPLACE FUNCTION public.get_rate_limit_trust_decision(
    p_user_id UUID DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_api_key_id UUID DEFAULT NULL
)
RETURNS TABLE(
    tier public.abuse_risk_tier,
    trust_multiplier NUMERIC,
    decision_source TEXT,
    subject_key TEXT
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

REVOKE ALL ON FUNCTION public.get_rate_limit_trust_decision(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rate_limit_trust_decision(UUID, TEXT, UUID) TO service_role;

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
        SELECT decision.trust_multiplier
        INTO v_trust_multiplier
        FROM private.get_rate_limit_trust_decision(v_user_id, v_ip, NULL) decision
        LIMIT 1;

        v_trust_multiplier := COALESCE(v_trust_multiplier, 1.00);
        v_primary_bucket := format('user:%s', v_user_id);
        v_secondary_bucket := CASE
            WHEN v_ip IS NULL THEN NULL
            ELSE format('user-ip:%s:%s', v_user_id, v_ip)
        END;

        IF v_ip IS NOT NULL THEN
            FOR v_rate_window_index IN 1..array_length(v_rate_windows, 1) LOOP
                v_rate_window := v_rate_windows[v_rate_window_index];
                v_limit := GREATEST(1, FLOOR(v_authenticated_user_ip_limits[v_rate_window_index] * v_trust_multiplier)::INTEGER);

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
            v_limit := GREATEST(1, FLOOR(v_authenticated_user_backstop_limits[v_rate_window_index] * v_trust_multiplier)::INTEGER);

            SELECT allowed, retry_after
            INTO v_allowed, v_retry_after
            FROM private.try_consume_rate_limit_bucket(v_primary_bucket, v_rate_window, v_limit);

            IF NOT COALESCE(v_allowed, FALSE) THEN
                PERFORM private.raise_rate_limit_exceeded(v_retry_after);
            END IF;
        END LOOP;
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

COMMENT ON TABLE public.abuse_reputation_subjects IS
    'Rolling server-side reputation for users, sessions, API keys, IPs, CIDRs, and user-location pairs.';
COMMENT ON TABLE public.abuse_activity_signals IS
    'Auditable behavior signals used to adjust abuse reputation without relying on client-visible static rules.';
COMMENT ON TABLE public.abuse_step_up_challenges IS
    'Adaptive challenge issuance and outcome records for medium-risk browser activity.';
COMMENT ON TABLE public.abuse_trust_overrides IS
    'Manual root-admin trust, watch, challenge, or restriction overrides with expiry and audit metadata.';
COMMENT ON FUNCTION public.record_abuse_activity_signal(JSONB, public.abuse_signal_type, INTEGER, INTEGER, UUID, UUID, TEXT, UUID, TEXT, TEXT, public.abuse_risk_tier, TEXT, JSONB) IS
    'Records abuse intelligence signals and updates rolling subject reputation for trusted-rate-limit decisions.';
COMMENT ON FUNCTION private.get_rate_limit_trust_decision(UUID, INET, UUID) IS
    'Returns the active trust tier and multiplier for PostgREST/authenticated rate-limit enforcement.';
COMMENT ON FUNCTION public.get_rate_limit_trust_decision(UUID, TEXT, UUID) IS
    'Service-role wrapper for resolving server-side trust multipliers from application middleware.';
COMMENT ON FUNCTION public.check_request() IS
    'PostgREST pre-request hook that enforces fixed-window write limits and applies server-side trusted-user multipliers.';
