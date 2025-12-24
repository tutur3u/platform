-- =============================================================================
-- Fix RLS Policy for Time Tracking Sessions Insert Bypass
-- Allows approvers to create sessions for request owners when approving requests
-- =============================================================================

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Allow users to insert their own sessions" ON time_tracking_sessions;

-- Add new RLS policy that allows both normal inserts and bypassed inserts
CREATE POLICY "Allow users to insert sessions with bypass support"
ON time_tracking_sessions
FOR INSERT
TO authenticated
WITH CHECK (
    -- Normal case: user can insert their own sessions
    (user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM workspace_members wu
        WHERE wu.ws_id = time_tracking_sessions.ws_id
        AND wu.user_id = auth.uid()
    ))
    OR
    -- The approver must still be a workspace member and have permission to manage requests
    (EXISTS (
        SELECT 1 FROM workspace_members wu
        WHERE wu.ws_id = time_tracking_sessions.ws_id
        AND wu.user_id = auth.uid()
    ) AND has_workspace_permission(time_tracking_sessions.ws_id, auth.uid(), 'manage_time_tracking_requests'))
);
