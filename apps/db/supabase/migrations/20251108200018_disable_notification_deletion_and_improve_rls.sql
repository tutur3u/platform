-- Disable notification deletion by removing DELETE policy
-- Users can only mark notifications as read/unread, not delete them
-- This prevents accidental data loss and maintains audit trail

-- Drop the existing delete policy
DROP POLICY IF EXISTS notifications_delete_policy ON public.notifications;

-- Add comment explaining why deletion is disabled
COMMENT ON TABLE public.notifications IS 'Notification records for workspace and user events. Deletion is disabled to maintain audit trail. Users can mark notifications as read/unread but cannot delete them.';
