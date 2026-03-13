-- Data API pre-request rate limiting with hybrid user/IP buckets.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.rate_limits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_method TEXT NOT NULL,
    request_path TEXT NOT NULL,
    db_role TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ip INET
);

CREATE INDEX IF NOT EXISTS idx_private_rate_limits_user_request_at
    ON private.rate_limits(user_id, request_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_private_rate_limits_role_ip_request_at
    ON private.rate_limits(db_role, ip, request_at DESC)
    WHERE ip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_private_rate_limits_ip_request_at
    ON private.rate_limits(ip, request_at DESC)
    WHERE ip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_private_rate_limits_request_at
    ON private.rate_limits(request_at DESC);

CREATE INDEX IF NOT EXISTS idx_private_rate_limits_role_request_at_no_ip
    ON private.rate_limits(db_role, request_at DESC)
    WHERE ip IS NULL AND user_id IS NULL;

REVOKE ALL ON TABLE private.rate_limits FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.rate_limit_counters (
    bucket TEXT NOT NULL,
    window_seconds INTEGER NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL,
    current_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bucket, window_seconds, window_started_at)
);

REVOKE ALL ON TABLE private.rate_limit_counters FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.safe_parse_inet(p_value TEXT)
RETURNS INET
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
    IF p_value IS NULL OR BTRIM(p_value) = '' THEN
        RETURN NULL;
    END IF;

    RETURN BTRIM(SPLIT_PART(p_value, ',', 1))::INET;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.get_request_ip(p_headers JSONB)
RETURNS INET
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT COALESCE(
        private.safe_parse_inet(p_headers ->> 'x-forwarded-for'),
        private.safe_parse_inet(p_headers ->> 'X-Forwarded-For'),
        private.safe_parse_inet(p_headers ->> 'cf-connecting-ip'),
        private.safe_parse_inet(p_headers ->> 'CF-Connecting-IP'),
        private.safe_parse_inet(p_headers ->> 'x-real-ip'),
        private.safe_parse_inet(p_headers ->> 'X-Real-IP')
    );
$$;

CREATE OR REPLACE FUNCTION private.raise_rate_limit_exceeded(p_retry_after INTEGER)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE sqlstate 'PGRST' USING
        message = json_build_object(
            'code', 'RATE_LIMITED',
            'message', 'Rate limit exceeded, try again later',
            'details', format('Retry after %s seconds', GREATEST(p_retry_after, 1)),
            'hint', 'Reduce request frequency and retry after the provided delay.'
        )::TEXT,
        detail = json_build_object(
            'status', 429,
            'headers', json_build_object(
                'Retry-After', GREATEST(p_retry_after, 1)::TEXT
            )
        )::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.try_consume_rate_limit_bucket(
    p_bucket TEXT,
    p_rate_window INTERVAL,
    p_limit INTEGER
)
RETURNS TABLE(
    allowed BOOLEAN,
    retry_after INTEGER
)
LANGUAGE plpgsql
VOLATILE
SET search_path = private, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_window_seconds INTEGER := GREATEST(1, EXTRACT(EPOCH FROM p_rate_window)::INTEGER);
    v_window_started_at TIMESTAMPTZ;
BEGIN
    v_window_started_at := to_timestamp(
        FLOOR(EXTRACT(EPOCH FROM v_now) / v_window_seconds) * v_window_seconds
    );

    RETURN QUERY
    WITH consumed AS (
        INSERT INTO private.rate_limit_counters (
            bucket,
            window_seconds,
            window_started_at,
            current_count,
            updated_at
        )
        VALUES (
            p_bucket,
            v_window_seconds,
            v_window_started_at,
            1,
            v_now
        )
        ON CONFLICT (bucket, window_seconds, window_started_at)
        DO UPDATE
        SET current_count = private.rate_limit_counters.current_count + 1,
            updated_at = v_now
        WHERE private.rate_limit_counters.current_count < p_limit
        RETURNING 1
    )
    SELECT EXISTS(SELECT 1 FROM consumed),
           GREATEST(
               1,
               CEIL(
                   EXTRACT(
                       EPOCH FROM (
                           (v_window_started_at + make_interval(secs => v_window_seconds))
                           - v_now
                       )
                   )
               )::INTEGER
           );
END;
$$;

CREATE OR REPLACE FUNCTION private.cleanup_rate_limits(
    p_retention INTERVAL DEFAULT INTERVAL '1 day'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_temp
AS $$
DECLARE
    v_deleted_logs INTEGER;
    v_deleted_counters INTEGER;
BEGIN
    DELETE FROM private.rate_limits
    WHERE request_at < NOW() - p_retention;

    GET DIAGNOSTICS v_deleted_logs = ROW_COUNT;

    DELETE FROM private.rate_limit_counters
    WHERE window_started_at < NOW() - p_retention;

    GET DIAGNOSTICS v_deleted_counters = ROW_COUNT;

    RETURN v_deleted_logs + v_deleted_counters;
END;
$$;

CREATE OR REPLACE FUNCTION private.build_rate_limit_dblink_connstr()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $$
DECLARE
    v_host TEXT := NULLIF(current_setting('app.rate_limit_dblink_host', true), '');
    v_port TEXT := COALESCE(NULLIF(current_setting('app.rate_limit_dblink_port', true), ''), '5432');
    v_user TEXT := NULLIF(current_setting('app.rate_limit_dblink_user', true), '');
    v_password TEXT := NULLIF(current_setting('app.rate_limit_dblink_password', true), '');
    v_sslmode TEXT := COALESCE(NULLIF(current_setting('app.rate_limit_dblink_sslmode', true), ''), 'require');
BEGIN
    IF v_host IS NULL OR v_user IS NULL OR v_password IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN format(
        'host=%s port=%s dbname=%s user=%s password=%s sslmode=%s connect_timeout=2',
        quote_literal(v_host),
        quote_literal(v_port),
        quote_literal(current_database()),
        quote_literal(v_user),
        quote_literal(v_password),
        quote_literal(v_sslmode)
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.record_rate_limit_attempt(
    p_request_method TEXT,
    p_request_path TEXT,
    p_db_role TEXT,
    p_user_id UUID,
    p_ip INET
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, extensions, public, pg_catalog, pg_temp
AS $$
DECLARE
    v_conn_name CONSTANT TEXT := 'rate_limit_conn';
    v_connstr TEXT;
    v_user_literal TEXT;
    v_ip_literal TEXT;
    v_sql TEXT;
BEGIN
    v_user_literal := CASE
        WHEN p_user_id IS NULL THEN
            'NULL'
        ELSE
            format('%L::uuid', p_user_id::TEXT)
    END;

    v_ip_literal := CASE
        WHEN p_ip IS NULL THEN
            'NULL'
        ELSE
            format('%L::inet', p_ip::TEXT)
    END;

    v_sql := format(
        'INSERT INTO private.rate_limits (request_method, request_path, db_role, user_id, ip) VALUES (%L, %L, %L, %s, %s);',
        p_request_method,
        p_request_path,
        p_db_role,
        v_user_literal,
        v_ip_literal
    );

    v_connstr := private.build_rate_limit_dblink_connstr();
    IF v_connstr IS NULL THEN
        RETURN;
    END IF;

    BEGIN
        PERFORM dblink_disconnect(v_conn_name);
    EXCEPTION
        WHEN OTHERS THEN
            NULL;
    END;

    PERFORM dblink_connect(v_conn_name, v_connstr);
    PERFORM dblink_exec(v_conn_name, v_sql);
    PERFORM dblink_disconnect(v_conn_name);
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            PERFORM dblink_disconnect(v_conn_name);
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;

        RETURN;
END;
$$;

-- Skip write-side rate-limit enforcement for read-only PostgREST transactions.
-- PostgREST executes STABLE/IMMUTABLE RPCs in read-only transactions even when
-- invoked through POST /rpc, so the pre-request hook must not perform writes in
-- that context.

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
        v_primary_bucket := format('user:%s', v_user_id);
        v_secondary_bucket := CASE
            WHEN v_ip IS NULL THEN NULL
            ELSE format('user-ip:%s:%s', v_user_id, v_ip)
        END;

        IF v_ip IS NOT NULL THEN
            FOR v_rate_window_index IN 1..array_length(v_rate_windows, 1) LOOP
                v_rate_window := v_rate_windows[v_rate_window_index];
                v_limit := v_authenticated_user_ip_limits[v_rate_window_index];

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
            v_limit := v_authenticated_user_backstop_limits[v_rate_window_index];

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




REVOKE ALL ON FUNCTION public.check_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_request() TO authenticator, anon, authenticated, service_role;

COMMENT ON TABLE private.rate_limits IS
    'Internal audit table for PostgREST Data API rate limiting with hybrid user and IP buckets.';
COMMENT ON TABLE private.rate_limit_counters IS
    'Internal fixed-window counters used for atomic PostgREST Data API rate-limit enforcement.';
COMMENT ON FUNCTION private.safe_parse_inet(TEXT) IS
    'Safely parses a forwarded IP string into inet and returns NULL for invalid values.';
COMMENT ON FUNCTION private.get_request_ip(JSONB) IS
    'Extracts the best-effort client IP from forwarded request headers.';
COMMENT ON FUNCTION private.raise_rate_limit_exceeded(INTEGER) IS
    'Raises a PostgREST-aware HTTP 429 response with Retry-After metadata.';
COMMENT ON FUNCTION private.try_consume_rate_limit_bucket(TEXT, INTERVAL, INTEGER) IS
    'Atomically increments a fixed-window bucket counter and returns whether the request can proceed.';
COMMENT ON FUNCTION private.cleanup_rate_limits(INTERVAL) IS
    'Deletes expired internal rate-limit audit rows and fixed-window counters, then returns the number removed.';
COMMENT ON FUNCTION private.build_rate_limit_dblink_connstr() IS
    'Builds the authenticated dblink connection string for autonomous rate-limit audit writes from app.rate_limit_dblink_* settings.';
COMMENT ON FUNCTION private.record_rate_limit_attempt(TEXT, TEXT, TEXT, UUID, INET) IS
    'Attempts to persist a rate-limit event through an authenticated dblink connection and otherwise fails open.';
COMMENT ON FUNCTION public.check_request() IS
    'PostgREST pre-request hook that atomically enforces fixed-window write limits, while skipping read-only transactions such as STABLE RPC calls.';

CREATE OR REPLACE FUNCTION public.admin_reset_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_temp
AS $$
DECLARE
    v_deleted_logs INTEGER;
    v_deleted_counters INTEGER;
BEGIN
    DELETE FROM private.rate_limits
    WHERE TRUE;

    GET DIAGNOSTICS v_deleted_logs = ROW_COUNT;

    DELETE FROM private.rate_limit_counters
    WHERE TRUE;

    GET DIAGNOSTICS v_deleted_counters = ROW_COUNT;

    RETURN v_deleted_logs + v_deleted_counters;
END;
$$;


REVOKE ALL ON FUNCTION public.admin_reset_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_rate_limits() TO service_role;

COMMENT ON FUNCTION public.admin_reset_rate_limits() IS
    'Service-role-only helper that clears internal Data API rate-limit audit rows and counters for controlled test setup.';

DO $rate_limit_cleanup$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM cron.job
        WHERE jobname = 'cleanup-rate-limits'
    ) THEN
        PERFORM cron.schedule(
            'cleanup-rate-limits',
            '*/15 * * * *',
            $$SELECT private.cleanup_rate_limits();$$
        );
    END IF;
END
$rate_limit_cleanup$;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.check_request';
NOTIFY pgrst, 'reload config';
