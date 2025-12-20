-- Migration: Allow pausing sessions for breaks even when threshold is 0
-- Description: Modifies the trigger to allow pausing sessions when a break will be created immediately after.
--              This bypasses the normal threshold validation since the break flow handles approval separately.
--              Also adds an RPC function to pause sessions with the bypass flag set.
-- Date: 2025-12-19

CREATE OR REPLACE FUNCTION public.check_time_tracking_session_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    threshold_days INTEGER;
BEGIN
    -- Allow start times up to 5 minutes in the future for clock sync and manual entries
    -- Only check when start_time or end_time are being changed
    IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
        IF NEW.start_time > NOW() + INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'Cannot update a time tracking session to have a start time more than 5 minutes in the future.';
        END IF;

    END IF;

    -- Check for the bypass flag set in the current session.
    -- Set this using: SET time_tracking.bypass_update_limit = 'on';
    IF current_setting('time_tracking.bypass_update_limit', true) = 'on' THEN
        RETURN NEW; -- Bypass the rule and allow the update.
    END IF;

    -- Check if a break is being paused (via context variable set by app)
    -- When pausing to take a break, skip threshold validation since approval happens at request level
    IF current_setting('time_tracking.is_break_pause', true) = 'on' THEN
        RETURN NEW; -- Allow pause for breaks without threshold validation
    END IF;

    -- Fetch threshold and pause exemption from workspace_settings
    SELECT missed_entry_date_threshold 
    INTO threshold_days
    FROM workspace_settings
    WHERE ws_id = NEW.ws_id;

    -- If threshold is NULL (not found or explicitly null), no restrictions apply
    -- This is the new default behavior: no approval needed
    IF threshold_days IS NULL THEN
        RETURN NEW;
    END IF;

    -- CRITICAL: Check if session is being completed (is_running changing from true to false)
    -- IMPORTANT: When pausing to create a break, this validation is SKIPPED via the flag above.
    -- The threshold check only applies to normal stop/completion, not break pauses.
    -- Break pauses are validated at the request creation level instead.
    IF OLD.is_running = true AND NEW.is_running = false THEN
        -- If threshold is 0, all completed sessions that aren't same-day must go through request flow
        -- EXCEPTION: Break pauses are exempt (checked via flag above)
        IF threshold_days = 0 THEN
            RAISE EXCEPTION 'All missed entries must be submitted as requests for approval.';
        END IF;

        -- Check if the session's start_time is older than the threshold
        IF threshold_days > 0 AND OLD.start_time < (NOW() - (threshold_days || ' days')::INTERVAL) THEN
            RAISE EXCEPTION 'Cannot complete sessions older than % days. Please submit a missed entry request instead.', threshold_days;
        END IF;
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
$function$;

-- RPC function to pause a session for a break, bypassing threshold validation
-- This is needed because the threshold check is handled at the request creation level for breaks
CREATE OR REPLACE FUNCTION public.pause_session_for_break(
    p_session_id UUID,
    p_end_time TIMESTAMPTZ,
    p_duration_seconds INTEGER
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_session RECORD;
    v_result json;
BEGIN
    -- Set the bypass flag for this transaction
    PERFORM set_config('time_tracking.is_break_pause', 'on', true);
    
    -- Update the session
    UPDATE time_tracking_sessions
    SET 
        end_time = p_end_time,
        duration_seconds = p_duration_seconds,
        is_running = false,
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_session;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;
    
    -- Return the updated session as JSON
    SELECT json_build_object(
        'id', v_session.id,
        'ws_id', v_session.ws_id,
        'user_id', v_session.user_id,
        'title', v_session.title,
        'description', v_session.description,
        'category_id', v_session.category_id,
        'task_id', v_session.task_id,
        'start_time', v_session.start_time,
        'end_time', v_session.end_time,
        'duration_seconds', v_session.duration_seconds,
        'is_running', v_session.is_running,
        'was_resumed', v_session.was_resumed,
        'parent_session_id', v_session.parent_session_id,
        'created_at', v_session.created_at,
        'updated_at', v_session.updated_at
    ) INTO v_result;
    
    RETURN v_result;
END;
$function$;
