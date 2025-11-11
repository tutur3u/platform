-- Migrate email-based notifications to proper user_id values
-- This fixes notifications that were created with email but have wrong user_id

-- Step 1: Update existing email-based notifications to match user_id with their email
-- This handles notifications where user_id doesn't match but email does
UPDATE public.notifications
SET user_id = auth_users.id
FROM auth.users AS auth_users
WHERE notifications.email IS NOT NULL
  AND notifications.email = auth_users.email
  AND (
    notifications.user_id IS NULL
    OR notifications.user_id != auth_users.id
  );

-- Step 2: Update the RLS policy to handle email-based access more broadly
-- Drop and recreate the SELECT policy to be more permissive with email matching
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;

CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT
  USING (
    -- Match by user_id
    user_id = auth.uid()
    OR
    -- Match by email (for invites sent before user signed up)
    (email IS NOT NULL AND email = public.get_user_email(auth.uid()))
    OR
    -- For workspace notifications, also check if user is a workspace member
    (
      scope = 'workspace'
      AND ws_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_members.ws_id = notifications.ws_id
          AND workspace_members.user_id = auth.uid()
      )
    )
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

-- Step 3: Update the existing trigger to ensure it runs on user login too
-- This catches any notifications that were created while the user was being created
CREATE OR REPLACE FUNCTION public.migrate_email_notifications_on_login()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all notifications with matching email to add user_id
  UPDATE public.notifications
  SET user_id = NEW.id
  WHERE email = NEW.email
    AND (user_id IS NULL OR user_id != NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires on auth.users INSERT (already exists from previous migration)
-- and also on user sessions (to catch edge cases)
DROP TRIGGER IF EXISTS trigger_migrate_email_notifications_on_login ON auth.users;
CREATE TRIGGER trigger_migrate_email_notifications_on_login
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.migrate_email_notifications_on_login();

-- Step 4: Add a manual function users can call to sync their notifications
CREATE OR REPLACE FUNCTION public.sync_my_notifications()
RETURNS TABLE(updated_count INTEGER) AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update notifications matching the current user's email
  WITH updated AS (
    UPDATE public.notifications
    SET user_id = auth.uid()
    WHERE email = public.get_user_email(auth.uid())
      AND (user_id IS NULL OR user_id != auth.uid())
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_count FROM updated;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.sync_my_notifications() TO authenticated;

COMMENT ON FUNCTION public.sync_my_notifications() IS
'Syncs email-based notifications to the current user. Call this if you are not seeing workspace invites that were sent to your email address.';

-- Step 5: Update the update policy to match the select policy
DROP POLICY IF EXISTS notifications_update_policy ON public.notifications;

CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (email IS NOT NULL AND email = public.get_user_email(auth.uid()))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (email IS NOT NULL AND email = public.get_user_email(auth.uid()))
  );

-- Step 6: Update the delete policy similarly
DROP POLICY IF EXISTS notifications_delete_policy ON public.notifications;

CREATE POLICY notifications_delete_policy ON public.notifications
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR (email IS NOT NULL AND email = public.get_user_email(auth.uid()))
  );
