-- ============================================================================
-- CONSOLIDATE NOTIFICATION RLS POLICIES
-- ============================================================================
-- This migration cleans up duplicate and overlapping RLS policies on the
-- notifications table that accumulated from previous migrations.
--
-- Previous state: 10 policies (8 from upgrade migration + 2 from email support)
-- New state: 3 policies (select, update, insert)
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop all existing notification RLS policies
-- ============================================================================

-- Drop policies from 20251108200009_upgrade_notifications_system.sql
DROP POLICY IF EXISTS "Users can view workspace notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view user notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view system notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update workspace notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update user notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete workspace notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete user notifications" ON public.notifications;

-- Drop policies from 20251108200010_add_notification_codes_and_email_support.sql
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;
DROP POLICY IF EXISTS notifications_update_policy ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_policy ON public.notifications;

-- ============================================================================
-- STEP 2: Create consolidated RLS policies
-- ============================================================================

-- Policy 1: SELECT - Unified policy for viewing notifications across all scopes
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT
  USING (
    -- User-scoped notifications: user owns the notification or matches email
    (
      scope = 'user'
      AND (
        user_id = auth.uid()
        OR (user_id IS NULL AND email = public.get_user_email(auth.uid()))
      )
    )
    OR
    -- Workspace-scoped notifications: user is workspace member
    (
      scope = 'workspace'
      AND user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_members.ws_id = notifications.ws_id
          AND workspace_members.user_id = auth.uid()
      )
    )
    OR
    -- System-scoped notifications: accessible to all authenticated users
    (
      scope = 'system'
      AND (
        user_id IS NULL
        OR user_id = auth.uid()
        OR (user_id IS NULL AND email = public.get_user_email(auth.uid()))
      )
    )
  );

-- Policy 2: UPDATE - Unified policy for updating notifications (marking as read, etc.)
CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE
  USING (
    -- User owns the notification or matches email (for pending users)
    user_id = auth.uid()
    OR (user_id IS NULL AND email = public.get_user_email(auth.uid()))
  )
  WITH CHECK (
    -- Same check for updated values
    user_id = auth.uid()
    OR (user_id IS NULL AND email = public.get_user_email(auth.uid()))
  );

-- Policy 3: INSERT - System-only policy (prevents direct client inserts)
-- Notifications must be created through functions/triggers only
CREATE POLICY notifications_insert_policy ON public.notifications
  FOR INSERT
  WITH CHECK (false);

-- ============================================================================
-- STEP 3: Update table comment to reflect RLS policy consolidation
-- ============================================================================

COMMENT ON TABLE public.notifications IS
'Notification records for workspace and user events.
- RLS policies consolidated in 20251111101400_consolidate_notifications_rls_policies.sql
- Deletion is disabled to maintain audit trail
- Users can view their notifications and mark them as read/unread
- Direct inserts are disabled; use create_notification() function instead';

-- ============================================================================
-- VERIFICATION QUERIES (commented out)
-- ============================================================================
-- After applying this migration, you should see exactly 3 policies:
-- SELECT pg_policies.* FROM pg_policies WHERE tablename = 'notifications';
--
-- Expected results:
-- 1. notifications_select_policy (FOR SELECT)
-- 2. notifications_update_policy (FOR UPDATE)
-- 3. notifications_insert_policy (FOR INSERT)
