-- Update to 1 day instead of 1 week for UPDATE operations
-- Add similar restrictions for INSERT operations (missed entries)

-- =================================================================
-- 1. UPDATE TRIGGER: Prevent editing sessions older than 1 day
-- =================================================================

CREATE OR REPLACE FUNCTION check_time_tracking_session_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Check for the bypass flag set in the current session.
    -- Set this using: SET time_tracking.bypass_update_limit = 'on';
    IF current_setting('time_tracking.bypass_update_limit', true) = 'on' THEN
        RETURN NEW; -- Bypass the rule and allow the update.
    END IF;

    -- This check only applies if start_time or end_time are being changed.
    -- It allows other fields (like notes or tasks) to be updated freely.
    IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
        -- Check if the original start_time is older than one day.
        -- We use OLD.start_time to base the check on the session's original creation time.
        IF OLD.start_time < (NOW() - INTERVAL '1 day') THEN
            -- If the condition is met, block the update and return an error message.
            RAISE EXCEPTION 'Editing start_time or end_time for sessions older than one day is not allowed.';
        END IF;
    END IF;

    -- If the checks pass, allow the update to proceed by returning the NEW row.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =================================================================
-- 2. INSERT TRIGGER: Prevent adding missed entries older than 1 day
-- =================================================================

CREATE OR REPLACE FUNCTION check_time_tracking_session_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Check for the bypass flag set in the current session.
    -- Set this using: SET time_tracking.bypass_insert_limit = 'on';
    IF current_setting('time_tracking.bypass_insert_limit', true) = 'on' THEN
        RETURN NEW; -- Bypass the rule and allow the insert.
    END IF;

    -- For manual entries (is_running = false and has start_time and end_time)
    -- Check if the start_time is older than one day
    IF NEW.is_running = false AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
        IF NEW.start_time < (NOW() - INTERVAL '1 day') THEN
            -- Block the insert and return an error message
            RAISE EXCEPTION 'Adding missed entries with start time older than one day is not allowed.';
        END IF;
    END IF;

    -- If the checks pass, allow the insert to proceed by returning the NEW row.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS enforce_time_tracking_insert ON public.time_tracking_sessions;

-- Create the trigger that runs on INSERT
CREATE TRIGGER enforce_time_tracking_insert
BEFORE INSERT ON public.time_tracking_sessions
FOR EACH ROW
EXECUTE FUNCTION check_time_tracking_session_insert();

-- Bypass function to update time tracking sessions older than 1 day for admins or requests that need it.
CREATE OR REPLACE FUNCTION update_time_tracking_session_bypassed(
    session_id UUID,
    new_start_time TIMESTAMP WITH TIME ZONE,
    new_end_time TIMESTAMP WITH TIME ZONE,
    new_notes TEXT
)
RETURNS time_tracking_sessions AS $$
DECLARE
    updated_row time_tracking_sessions;
BEGIN
    -- 1. Set the bypass flag
    PERFORM set_config('time_tracking.bypass_update_limit', 'on', true);

    -- 2. Execute the update, which will now ignore the trigger
    UPDATE time_tracking_sessions
    SET
        start_time = new_start_time,
        end_time = new_end_time,
        notes = new_notes
    WHERE
        id = session_id
    RETURNING * INTO updated_row;

    -- 3. Unset the bypass flag (optional but good practice)
    PERFORM set_config('time_tracking.bypass_update_limit', 'off', true);

    RETURN updated_row;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Bypass function to insert missed time tracking sessions older than 1 day for admins or requests that need it.
CREATE OR REPLACE FUNCTION insert_time_tracking_session_bypassed(
    p_ws_id UUID,
    p_user_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_end_time TIMESTAMP WITH TIME ZONE,
    p_duration_seconds INTEGER,
    p_category_id UUID DEFAULT NULL,
    p_task_id UUID DEFAULT NULL
)
RETURNS time_tracking_sessions AS $$
DECLARE
    inserted_row time_tracking_sessions;
BEGIN
    -- 1. Set the bypass flag
    PERFORM set_config('time_tracking.bypass_insert_limit', 'on', true);

    -- 2. Execute the insert, which will now ignore the trigger
    INSERT INTO time_tracking_sessions (
        ws_id,
        user_id,
        title,
        description,
        category_id,
        task_id,
        start_time,
        end_time,
        duration_seconds,
        is_running
    ) VALUES (
        p_ws_id,
        p_user_id,
        p_title,
        p_description,
        p_category_id,
        p_task_id,
        p_start_time,
        p_end_time,
        p_duration_seconds,
        false
    )
    RETURNING * INTO inserted_row;

    -- 3. Unset the bypass flag (optional but good practice)
    PERFORM set_config('time_tracking.bypass_insert_limit', 'off', true);

    RETURN inserted_row;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;