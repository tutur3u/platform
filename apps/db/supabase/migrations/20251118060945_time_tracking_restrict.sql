-- Prevent updating sessions to dates more than one day ago
-- This prevents the vulnerability of creating a session for today and backdating it to a month ago

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
        
        -- NEW CHECK: Also check if the NEW start_time being set is older than one day
        -- This prevents the vulnerability of backdating a session to the past
        IF NEW.start_time < (NOW() - INTERVAL '1 day') THEN
            RAISE EXCEPTION 'Cannot update session to a start time more than one day ago.';
        END IF;
    END IF;

    -- If the checks pass, allow the update to proceed by returning the NEW row.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

