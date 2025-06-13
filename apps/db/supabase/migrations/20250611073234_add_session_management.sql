-- Session management functions
-- Note: Supabase handles sessions internally, but we can work with auth.sessions table

-- Function to get user sessions with details
CREATE OR REPLACE FUNCTION public.get_user_sessions(user_id uuid)
RETURNS TABLE (
    session_id text,
    created_at timestamptz,
    updated_at timestamptz,
    user_agent text,
    ip text,
    is_current boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if user is requesting their own sessions
    IF auth.uid() != user_id THEN
        RAISE EXCEPTION 'Unauthorized access to sessions';
    END IF;

    -- Return session information from auth.sessions
    -- Note: This is a simplified version as Supabase's auth.sessions schema may vary
    RETURN QUERY
    SELECT 
        s.id::text as session_id,
        s.created_at,
        s.updated_at,
        COALESCE(s.user_agent, 'Unknown') as user_agent,
        COALESCE(s.ip::text, 'Unknown') as ip,
        (s.id::text = COALESCE(auth.jwt()->>'session_id', ''))::boolean as is_current
    FROM auth.sessions s
    WHERE s.user_id = get_user_sessions.user_id
    ORDER BY s.updated_at DESC;
END;
$$;

-- Function to revoke a specific session
CREATE OR REPLACE FUNCTION public.revoke_user_session(
    target_user_id uuid,
    session_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_found boolean := false;
BEGIN
    -- Check if user is revoking their own session
    IF auth.uid() != target_user_id THEN
        RAISE EXCEPTION 'Unauthorized access to sessions';
    END IF;

    -- Check if session exists and belongs to user
    SELECT EXISTS(
        SELECT 1 FROM auth.sessions 
        WHERE id = session_id::uuid 
        AND user_id = target_user_id
    ) INTO session_found;

    IF NOT session_found THEN
        RAISE EXCEPTION 'Session not found or unauthorized';
    END IF;

    -- Delete the session
    DELETE FROM auth.sessions 
    WHERE id = session_id::uuid 
    AND user_id = target_user_id;

    RETURN true;
END;
$$;

-- Function to revoke all sessions except current
CREATE OR REPLACE FUNCTION public.revoke_all_other_sessions(user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_session_id text;
    revoked_count integer;
BEGIN
    -- Check if user is revoking their own sessions
    IF auth.uid() != user_id THEN
        RAISE EXCEPTION 'Unauthorized access to sessions';
    END IF;

    -- Get current session ID from JWT
    current_session_id := auth.jwt()->>'session_id';

    -- Delete all sessions except current
    DELETE FROM auth.sessions 
    WHERE user_id = revoke_all_other_sessions.user_id
    AND (current_session_id IS NULL OR current_session_id = '' OR id::text != current_session_id);

    GET DIAGNOSTICS revoked_count = ROW_COUNT;
    
    RETURN revoked_count;
END;
$$;

-- Function to get session statistics
CREATE OR REPLACE FUNCTION public.get_user_session_stats(user_id uuid)
RETURNS TABLE (
    total_sessions integer,
    active_sessions integer,
    current_session_age interval
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_session_id text;
BEGIN
    -- Check if user is requesting their own stats
    IF auth.uid() != user_id THEN
        RAISE EXCEPTION 'Unauthorized access to session stats';
    END IF;

    current_session_id := auth.jwt()->>'session_id';

    RETURN QUERY
    SELECT 
        COUNT(*)::integer as total_sessions,
        COUNT(CASE WHEN s.updated_at > NOW() - INTERVAL '1 hour' THEN 1 END)::integer as active_sessions,
        CASE 
            WHEN current_session_id IS NOT NULL AND current_session_id != '' THEN 
                NOW() - (SELECT created_at FROM auth.sessions WHERE id::text = current_session_id)
            ELSE INTERVAL '0'
        END as current_session_age
    FROM auth.sessions s
    WHERE s.user_id = get_user_session_stats.user_id
        AND s.updated_at > NOW() - INTERVAL '30 days';
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_user_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_session_stats(uuid) TO authenticated;
