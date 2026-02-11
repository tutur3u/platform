-- Migration: Add RPC to insert time tracking sessions with bypass flag
-- When a user has the bypass_time_tracking_request_approval permission,
-- the API route needs to set the session variable 'time_tracking.bypass_insert_limit'
-- in the same transaction as the insert. This RPC wraps both operations.

CREATE OR REPLACE FUNCTION public.insert_time_tracking_session_with_bypass(
    p_ws_id UUID,
    p_user_id UUID,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_task_id UUID DEFAULT NULL,
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_duration_seconds INTEGER DEFAULT NULL,
    p_is_running BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Set bypass flag for this transaction so the BEFORE INSERT trigger skips
    -- the missed-entry threshold check
    PERFORM set_config('time_tracking.bypass_insert_limit', 'on', true);

    INSERT INTO time_tracking_sessions (
        ws_id, user_id, title, description, category_id, task_id,
        start_time, end_time, duration_seconds, is_running
    ) VALUES (
        p_ws_id, p_user_id, p_title, p_description, p_category_id, p_task_id,
        p_start_time, p_end_time, p_duration_seconds, p_is_running
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Migration: Add RPC to update time tracking sessions with bypass flag
-- When a user has the bypass_time_tracking_request_approval permission,
-- the API route needs to set the session variable 'time_tracking.bypass_update_limit'
-- in the same transaction as the update. This RPC wraps both operations.
-- Uses JSONB p_fields so the caller can pass only the fields being updated,
-- and the function can distinguish "not provided" from "set to null" via `?`.

CREATE OR REPLACE FUNCTION public.update_time_tracking_session_with_bypass(
    p_session_id UUID,
    p_fields JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Set bypass flag for this transaction so the BEFORE UPDATE trigger skips
    -- the missed-entry threshold check
    PERFORM set_config('time_tracking.bypass_update_limit', 'on', true);

    UPDATE time_tracking_sessions
    SET
        title          = CASE WHEN p_fields ? 'title'          THEN (p_fields->>'title')                              ELSE title END,
        description    = CASE WHEN p_fields ? 'description'    THEN (p_fields->>'description')                        ELSE description END,
        category_id    = CASE WHEN p_fields ? 'category_id'    THEN (p_fields->>'category_id')::UUID                  ELSE category_id END,
        task_id        = CASE WHEN p_fields ? 'task_id'        THEN (p_fields->>'task_id')::UUID                      ELSE task_id END,
        start_time     = CASE WHEN p_fields ? 'start_time'     THEN (p_fields->>'start_time')::TIMESTAMPTZ            ELSE start_time END,
        end_time       = CASE WHEN p_fields ? 'end_time'       THEN (p_fields->>'end_time')::TIMESTAMPTZ              ELSE end_time END,
        duration_seconds = CASE WHEN p_fields ? 'duration_seconds' THEN (p_fields->>'duration_seconds')::INTEGER      ELSE duration_seconds END,
        is_running     = CASE WHEN p_fields ? 'is_running'     THEN (p_fields->>'is_running')::BOOLEAN                ELSE is_running END,
        updated_at     = NOW()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$$;
