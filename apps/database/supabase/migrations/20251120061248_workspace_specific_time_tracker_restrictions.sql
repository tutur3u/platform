alter table workspace_settings add column missed_entry_date_threshold integer default 1;

comment on column workspace_settings.missed_entry_date_threshold is 'Setting for the maximum time before needing to request a time-entry to be added';

ALTER TABLE public.workspace_settings
ADD CONSTRAINT chk_missed_entry_date_threshold
CHECK (missed_entry_date_threshold >= 0);

-- =================================================================
-- Update trigger functions to use workspace-specific threshold
-- =================================================================

-- UPDATE TRIGGER: Prevent editing sessions older than workspace threshold
CREATE OR REPLACE FUNCTION check_time_tracking_session_update()
RETURNS TRIGGER AS $$
DECLARE
    threshold_days INTEGER;
BEGIN
    -- Check for the bypass flag set in the current session.
    -- Set this using: SET time_tracking.bypass_update_limit = 'on';
    IF current_setting('time_tracking.bypass_update_limit', true) = 'on' THEN
        RETURN NEW; -- Bypass the rule and allow the update.
    END IF;

    -- Fetch threshold from workspace_settings
    SELECT missed_entry_date_threshold INTO threshold_days
    FROM workspace_settings 
    WHERE ws_id = NEW.ws_id;

    -- If threshold is NULL or not found, default to 1
    threshold_days := COALESCE(threshold_days, 1);

    -- This check only applies if start_time or end_time are being changed.
    -- It allows other fields (like notes or tasks) to be updated freely.
    IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
        -- Check if the original start_time is older than the threshold.
        -- We use OLD.start_time to base the check on the session's original creation time.
        IF threshold_days > 0 AND OLD.start_time < (NOW() - (threshold_days || ' days')::INTERVAL) THEN
            -- If the condition is met, block the update and return an error message.
            RAISE EXCEPTION 'Editing start_time or end_time for sessions older than % days is not allowed.', threshold_days;
        END IF;
        
        -- NEW CHECK: Also check if the NEW start_time being set is older than the threshold
        -- This prevents the vulnerability of creating a session for today and backdating it to the past
        IF threshold_days > 0 AND NEW.start_time < (NOW() - (threshold_days || ' days')::INTERVAL) THEN
            RAISE EXCEPTION 'Cannot update session to a start time more than % days ago.', threshold_days;
        END IF;
    END IF;

    -- If the checks pass, allow the update to proceed by returning the NEW row.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- INSERT TRIGGER: Prevent adding missed entries older than workspace threshold
-- When threshold = 0, all missed entries must go through request flow
CREATE OR REPLACE FUNCTION check_time_tracking_session_insert()
RETURNS TRIGGER AS $$
DECLARE
    threshold_days INTEGER;
BEGIN
    -- Check for the bypass flag set in the current session.
    -- Set this using: SET time_tracking.bypass_insert_limit = 'on';
    IF current_setting('time_tracking.bypass_insert_limit', true) = 'on' THEN
        RETURN NEW; -- Bypass the rule and allow the insert.
    END IF;

    -- Fetch threshold from workspace_settings
    SELECT missed_entry_date_threshold INTO threshold_days
    FROM workspace_settings 
    WHERE ws_id = NEW.ws_id;

    -- If threshold is NULL or not found, default to 1
    threshold_days := COALESCE(threshold_days, 1);

    -- For manual entries (is_running = false and has start_time and end_time)
    IF NEW.is_running = false AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
        -- If threshold is 0, all missed entries must go through request flow
        IF threshold_days = 0 THEN
            RAISE EXCEPTION 'All missed entries must be submitted as requests for approval.';
        END IF;
        
        -- Check if the start_time is older than the threshold
        IF NEW.start_time < (NOW() - (threshold_days || ' days')::INTERVAL) THEN
            -- Block the insert and return an error message
            RAISE EXCEPTION 'Adding missed entries with start time older than % days is not allowed.', threshold_days;
        END IF;
    END IF;

    -- If the checks pass, allow the insert to proceed by returning the NEW row.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

