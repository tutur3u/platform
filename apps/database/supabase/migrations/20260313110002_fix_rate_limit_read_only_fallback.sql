-- Keep PostgREST rate-limit audit logging on an authenticated dblink
-- connection so failures stay fail-open without in-transaction fallbacks.

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

COMMENT ON FUNCTION private.record_rate_limit_attempt(TEXT, TEXT, TEXT, UUID, INET) IS
    'Attempts to persist a rate-limit event through an authenticated dblink connection and otherwise fails open.';
