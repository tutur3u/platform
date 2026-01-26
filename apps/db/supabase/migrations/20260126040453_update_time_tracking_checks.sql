-- Migration: Allow future sessions based on workspace configuration
-- This migration updates the time tracking session validation to respect the
-- ALLOW_FUTURE_SESSIONS workspace configuration.
-- It also sets the trigger functions as SECURITY DEFINER to bypass RLS 
-- when checking workspace configurations and settings.

-- ============================================================================
-- UPDATE INSERT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_time_tracking_session_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    threshold_days INTEGER;
    allow_future BOOLEAN;
BEGIN
    -- Check if future sessions are allowed for this workspace
    -- Since this is SECURITY DEFINER, it bypasses RLS on workspace_configs
    SELECT COALESCE(value = 'true', false) INTO allow_future
    FROM workspace_configs
    WHERE ws_id = NEW.ws_id AND id = 'ALLOW_FUTURE_SESSIONS';

    -- Allow start and end times up to 5 minutes in the future regardless of config for clock sync
    -- If allow_future is true, allow any future start time
    IF NOT allow_future THEN
        IF NEW.start_time > NOW() + INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'Cannot create a time tracking session with a start time more than 5 minutes in the future.';
        END IF;

        IF NEW.end_time > NOW() + INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'Cannot create a time tracking session with an end time more than 5 minutes in the future.';
        END IF;
    END IF;

    -- Check for the bypass flag set in the current session.
    IF current_setting('time_tracking.bypass_insert_limit', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- Fetch threshold from workspace_settings
    -- Since this is SECURITY DEFINER, it bypasses RLS on workspace_settings
    SELECT missed_entry_date_threshold INTO threshold_days
    FROM workspace_settings
    WHERE ws_id = NEW.ws_id;

    IF threshold_days IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.is_running = false AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
        IF threshold_days = 0 THEN
            RAISE EXCEPTION 'All missed entries must be submitted as requests for approval.';
        END IF;

        IF NEW.start_time < (NOW() - (threshold_days || ' days')::INTERVAL) THEN
            RAISE EXCEPTION 'Adding missed entries with start time older than % days is not allowed.', threshold_days;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ============================================================================
-- UPDATE UPDATE TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_time_tracking_session_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    threshold_days INTEGER;
    allow_future BOOLEAN;
BEGIN
    -- Only check when start_time or end_time are being changed
    IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
        -- Check if future sessions are allowed for this workspace
        -- Since this is SECURITY DEFINER, it bypasses RLS on workspace_configs
        SELECT COALESCE(value = 'true', false) INTO allow_future
        FROM workspace_configs
        WHERE ws_id = NEW.ws_id AND id = 'ALLOW_FUTURE_SESSIONS';

        IF NOT allow_future THEN
            IF NEW.start_time > NOW() + INTERVAL '5 minutes' THEN
                RAISE EXCEPTION 'Cannot update a time tracking session to have a start time more than 5 minutes in the future.';
            END IF;

            IF NEW.end_time > NOW() + INTERVAL '5 minutes' THEN
                RAISE EXCEPTION 'Cannot update a time tracking session to have an end time more than 5 minutes in the future.';
            END IF;
        END IF;
    END IF;

    -- Check for the bypass flag set in the current session.
    IF current_setting('time_tracking.bypass_update_limit', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- Fetch threshold from workspace_settings
    -- Since this is SECURITY DEFINER, it bypasses RLS on workspace_settings
    SELECT missed_entry_date_threshold INTO threshold_days
    FROM workspace_settings
    WHERE ws_id = NEW.ws_id;

    IF threshold_days IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
        IF threshold_days > 0 AND OLD.start_time < (NOW() - (threshold_days || ' days')::INTERVAL) THEN
            RAISE EXCEPTION 'Editing start_time or end_time for sessions older than % days is not allowed.', threshold_days;
        END IF;

        IF threshold_days > 0 AND NEW.start_time < (NOW() - (threshold_days || ' days')::INTERVAL) THEN
            RAISE EXCEPTION 'Cannot update session to a start time more than % days ago.', threshold_days;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
