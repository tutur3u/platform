-- =================================================================
-- Migration: Change default behavior for missed_entry_date_threshold
-- 
-- Previously: NULL defaulted to 1 day (required approval for entries > 1 day old)
-- Now: NULL means "no approval needed" (any entry can be added directly)
-- 
-- Values:
--   NULL: No approval needed (default - any entry allowed)
--   0: All entries require approval
--   > 0: Entries older than N days require approval
-- =================================================================

-- Change the column default from 1 to NULL
ALTER TABLE public.workspace_settings 
ALTER COLUMN missed_entry_date_threshold SET DEFAULT NULL;

-- Update the column comment to reflect new behavior
COMMENT ON COLUMN workspace_settings.missed_entry_date_threshold IS 
'Setting for the maximum time before needing to request a time-entry to be added. NULL = no approval needed (default), 0 = all entries require approval, >0 = entries older than N days require approval';

-- =================================================================
-- Update trigger functions to handle NULL as "no approval needed"
-- =================================================================

-- UPDATE TRIGGER: Prevent editing sessions older than workspace threshold
-- NULL threshold now means no restrictions apply
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

    -- If threshold is NULL (not found or explicitly null), no restrictions apply
    -- This is the new default behavior: no approval needed
    IF threshold_days IS NULL THEN
        RETURN NEW;
    END IF;

    -- This check only applies if start_time or end_time are being changed.
    -- It allows other fields (like notes or tasks) to be updated freely.
    IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
        -- Check if the original start_time is older than the threshold.
        -- We use OLD.start_time to base the check on the session's original creation time.
        IF threshold_days > 0 AND OLD.start_time < (NOW() - (threshold_days || ' days')::INTERVAL) THEN
            -- If the condition is met, block the update and return an error message.
            RAISE EXCEPTION 'Editing start_time or end_time for sessions older than % days is not allowed.', threshold_days;
        END IF;
        
        -- Also check if the NEW start_time being set is older than the threshold
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
-- NULL threshold now means no restrictions apply (any entry allowed)
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

    -- If threshold is NULL (not found or explicitly null), no restrictions apply
    -- This is the new default behavior: no approval needed
    IF threshold_days IS NULL THEN
        RETURN NEW;
    END IF;

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