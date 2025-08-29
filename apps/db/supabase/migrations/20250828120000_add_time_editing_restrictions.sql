-- Full script for time tracking session policies and triggers

-- =================================================================
-- 1. CLEANUP: Drop old policies and the trigger if they exist.
-- This makes the script safe to run multiple times.
-- =================================================================

-- Drop the original permissive policy
DROP POLICY IF EXISTS "Allow users to manage their own sessions" ON "public"."time_tracking_sessions";

-- Drop the policy with the complex check, which we are replacing
DROP POLICY IF EXISTS "Allow users to update their own sessions with restrictions" ON "public"."time_tracking_sessions";

-- Drop the trigger and its function if they already exist from a previous run
DROP TRIGGER IF EXISTS enforce_time_tracking_update ON public.time_tracking_sessions;
DROP FUNCTION IF EXISTS check_time_tracking_session_update();


-- =================================================================
-- 2. TRIGGER LOGIC: Create the function that validates updates.
-- This function contains the rule to prevent editing old sessions.
-- =================================================================

CREATE OR REPLACE FUNCTION check_time_tracking_session_update()
RETURNS TRIGGER AS $$
BEGIN
    -- This check only applies if start_time or end_time are being changed.
    -- It allows other fields (like notes or tasks) to be updated freely.
    IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
        -- Check if the original start_time is older than one week.
        -- We use OLD.start_time to base the check on the session's original creation time.
        IF OLD.start_time < (NOW() - INTERVAL '1 week') THEN
            -- If the condition is met, block the update and return an error message.
            RAISE EXCEPTION 'Editing start_time or end_time for sessions older than one week is not allowed.';
        END IF;
    END IF;

    -- If the checks pass, allow the update to proceed by returning the NEW row.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =================================================================
-- 3. ATTACH TRIGGER: Create the trigger that runs the function.
-- =================================================================

CREATE TRIGGER enforce_time_tracking_update
BEFORE UPDATE ON public.time_tracking_sessions
FOR EACH ROW
EXECUTE FUNCTION check_time_tracking_session_update();


-- =================================================================
-- 4. ROW-LEVEL SECURITY POLICIES
-- These policies control WHO can perform actions on the rows.
-- The complex validation logic is now handled by the trigger above.
-- =================================================================

-- POLICY FOR INSERT: Allow users to insert their own sessions into workspaces they belong to.
CREATE POLICY "Allow users to insert their own sessions" ON "public"."time_tracking_sessions"
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_sessions.ws_id 
        AND wu.user_id = auth.uid()
    )
);

-- POLICY FOR DELETE: Allow users to delete their own sessions from workspaces they belong to.
CREATE POLICY "Allow users to delete their own sessions" ON "public"."time_tracking_sessions"
USING (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_sessions.ws_id 
        AND wu.user_id = auth.uid()
    )
);

-- POLICY FOR UPDATE (SIMPLIFIED): Allow users to update their own sessions.
-- The complex time-based rule is now handled by the trigger.
CREATE POLICY "Allow users to update their own sessions" ON "public"."time_tracking_sessions"
AS PERMISSIVE FOR UPDATE TO authenticated
USING (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_sessions.ws_id 
        AND wu.user_id = auth.uid()
    )
)
WITH CHECK (
    user_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM workspace_members wu 
        WHERE wu.ws_id = time_tracking_sessions.ws_id 
        AND wu.user_id = auth.uid()
    )
);