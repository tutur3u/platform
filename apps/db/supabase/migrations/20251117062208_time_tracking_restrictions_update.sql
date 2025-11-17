-- Update to 1 day instead of 1 week

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

-- Bypass function to update time tracking sessions older than 1 day for admins or requests that need it.
CREATE OR REPLACE FUNCTION update_time_tracking_session_bypassed(
    session_id UUID,
    new_start_time TIMESTAMP WITH TIME ZONE,
    new_end_time TIMESTAMP WITH TIME ZONE,
    new_notes TEXT
)
RETURNS time_tracking_sessions AS $$ -- Assuming your table is named 'time_tracking_sessions'
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
        notes = new_notes -- Include any other fields you might update
    WHERE
        id = session_id
    RETURNING * INTO updated_row;

    -- 3. Unset the bypass flag (optional but good practice)
    -- This helps ensure the variable doesn't accidentally persist
    -- in a reused connection if the pool behaves unexpectedly.
    PERFORM set_config('time_tracking.bypass_update_limit', 'off', true);

    RETURN updated_row;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;