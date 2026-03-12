-- Avoid read-only transaction failures when the PostgREST rate-limit hook
-- falls back from dblink logging to an in-transaction insert.

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

    PERFORM dblink_exec(
        format('dbname=%L', current_database()),
        v_sql
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Fail open to avoid blocking RPCs or writes when autonomous logging is
        -- unavailable. Read-only transactions cannot use the direct insert
        -- fallback, so bail out silently in that case.
        BEGIN
            IF COALESCE(current_setting('transaction_read_only', true), 'off') = 'on' THEN
                RETURN;
            END IF;

            INSERT INTO private.rate_limits (
                request_method,
                request_path,
                db_role,
                user_id,
                ip
            )
            VALUES (
                p_request_method,
                p_request_path,
                p_db_role,
                p_user_id,
                p_ip
            );
        EXCEPTION
            WHEN read_only_sql_transaction THEN
                RETURN;
            WHEN OTHERS THEN
                RETURN;
        END;
END;
$$;

COMMENT ON FUNCTION private.record_rate_limit_attempt(TEXT, TEXT, TEXT, UUID, INET) IS
    'Attempts to persist a rate-limit event via dblink, then fails open when fallback inserts are unavailable or the request transaction is read-only.';
