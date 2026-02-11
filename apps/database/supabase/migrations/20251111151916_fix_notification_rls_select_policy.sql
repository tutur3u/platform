-- ============================================================================
-- FIX NOTIFICATION RLS SELECT POLICY
-- ============================================================================
-- This migration fixes the SELECT policy to prevent users from seeing
-- workspace notifications that belong to other users in the same workspace.
--
-- ISSUE: The current policy allows any workspace member to see workspace
-- notifications regardless of the user_id, causing users to see other
-- users' notifications. They can see them but cannot update them, resulting
-- in 403 errors.
--
-- FIX: Require user_id match for workspace notifications, just like the
-- UPDATE policy does.
-- ============================================================================

-- Drop the current SELECT policy
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;

-- Recreate with proper user_id check for workspace notifications
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT
  USING (
    -- Match by user_id (most common case)
    user_id = auth.uid()
    OR
    -- Match by email (for invites sent before user signed up)
    (email IS NOT NULL AND email = public.get_user_email(auth.uid()))
    OR
    -- System notifications are visible to all authenticated users if they have matching user_id or email
    (
      scope = 'system'
      AND (
        user_id = auth.uid()
        OR (email IS NOT NULL AND email = public.get_user_email(auth.uid()))
      )
    )
  );

-- Add comment explaining the policy
COMMENT ON POLICY notifications_select_policy ON public.notifications IS
'Users can only view notifications assigned to them (by user_id or email match).
Workspace membership alone is not sufficient - the notification must be assigned to the specific user.
This ensures consistency with the UPDATE policy and prevents users from seeing other users'' notifications.';
