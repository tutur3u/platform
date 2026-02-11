-- Add translation code support and email-based notifications for pending users
-- This migration enables notifications for users who don't have accounts yet (workspace invites)

-- Step 1: Make user_id nullable to support email-based notifications
ALTER TABLE public.notifications
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 1b: Make ws_id and user_id nullable in notification_batches to support user-scoped and email-based notifications
ALTER TABLE public.notification_batches
  ALTER COLUMN ws_id DROP NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Add code and email columns
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Step 2b: Add email column to notification_batches for pending users
ALTER TABLE public.notification_batches
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Step 2c: Add constraint to ensure either user_id or email is present in batches
ALTER TABLE public.notification_batches
  ADD CONSTRAINT notification_batches_user_or_email_check CHECK (
    user_id IS NOT NULL OR email IS NOT NULL
  );

-- Step 3: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_email ON public.notifications(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_code ON public.notifications(code) WHERE code IS NOT NULL;

-- Step 4: Add constraint to ensure either user_id or email is present
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_or_email_check CHECK (
    user_id IS NOT NULL OR email IS NOT NULL
  );

-- Step 5: Update get_or_create_notification_batch to support email parameter
CREATE OR REPLACE FUNCTION public.get_or_create_notification_batch(
    p_ws_id UUID,
    p_user_id UUID,
    p_channel TEXT,
    p_window_minutes INTEGER DEFAULT 10,
    p_email TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_batch_id UUID;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
BEGIN
    -- Try to find an existing pending batch within the window
    -- Match by user_id if provided, otherwise by email
    IF p_user_id IS NOT NULL THEN
        SELECT id INTO v_batch_id
        FROM public.notification_batches
        WHERE (ws_id = p_ws_id OR (ws_id IS NULL AND p_ws_id IS NULL))
          AND user_id = p_user_id
          AND channel = p_channel
          AND status = 'pending'
          AND window_end > now()
        ORDER BY window_start DESC
        LIMIT 1;
    ELSIF p_email IS NOT NULL THEN
        SELECT id INTO v_batch_id
        FROM public.notification_batches
        WHERE (ws_id = p_ws_id OR (ws_id IS NULL AND p_ws_id IS NULL))
          AND email = p_email
          AND channel = p_channel
          AND status = 'pending'
          AND window_end > now()
        ORDER BY window_start DESC
        LIMIT 1;
    END IF;

    -- If no batch found, create a new one
    IF v_batch_id IS NULL THEN
        v_window_start := now();
        v_window_end := now() + (p_window_minutes || ' minutes')::interval;

        INSERT INTO public.notification_batches (
            ws_id,
            user_id,
            email,
            channel,
            window_start,
            window_end
        ) VALUES (
            p_ws_id,
            p_user_id,
            p_email,
            p_channel,
            v_window_start,
            v_window_end
        )
        RETURNING id INTO v_batch_id;
    END IF;

    RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create helper function to get user email (SECURITY DEFINER to access auth.users)
CREATE OR REPLACE FUNCTION public.get_user_email(p_user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT email FROM auth.users WHERE id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Step 7: Update RLS policies to support email-based access

-- Drop existing policies
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;
DROP POLICY IF EXISTS notifications_update_policy ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_policy ON public.notifications;

-- Recreate select policy with email support
-- Note: For email-only notifications, they will be migrated to user_id when user signs up
-- Until then, we check if the notification's email matches the current user's email
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT
  USING (
    -- User-level notifications: check user_id or email (using helper function)
    (scope = 'user' AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND email = public.get_user_email(auth.uid()))
    ))
    OR
    -- Workspace notifications: check workspace membership
    (scope = 'workspace' AND (
      user_id = auth.uid()
      AND
      (ws_id IS NULL OR EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_members.ws_id = notifications.ws_id
          AND workspace_members.user_id = auth.uid()
      ))
    ))
    OR
    -- System notifications: accessible to all authenticated users
    (scope = 'system' AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND email = public.get_user_email(auth.uid()))
    ))
  );

-- Recreate update policy (mark as read)
CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE
  USING (
    user_id = auth.uid() OR
    (user_id IS NULL AND email = public.get_user_email(auth.uid()))
  )
  WITH CHECK (
    user_id = auth.uid() OR
    (user_id IS NULL AND email = public.get_user_email(auth.uid()))
  );

-- Recreate delete policy (archive own notifications)
CREATE POLICY notifications_delete_policy ON public.notifications
  FOR DELETE
  USING (
    user_id = auth.uid() OR
    (user_id IS NULL AND email = public.get_user_email(auth.uid()))
  );

-- Step 8: Update create_notification function to support email and code
CREATE OR REPLACE FUNCTION public.create_notification(
    p_ws_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_type TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_data JSONB DEFAULT '{}'::jsonb,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_scope public.notification_scope DEFAULT 'workspace',
    p_priority public.notification_priority DEFAULT 'medium'
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
    v_should_send_web BOOLEAN;
    v_should_send_email BOOLEAN;
    v_batch_id UUID;
    v_target_user_id UUID;
    v_target_email TEXT;
BEGIN
    -- Validate that at least user_id or email is provided
    IF p_user_id IS NULL AND p_email IS NULL THEN
        RAISE EXCEPTION 'Either p_user_id or p_email must be provided';
    END IF;

    -- Determine target user_id and email
    IF p_user_id IS NOT NULL THEN
        v_target_user_id := p_user_id;
        -- Get email from user_id if not provided
        IF p_email IS NULL THEN
            SELECT email INTO v_target_email
            FROM auth.users
            WHERE id = p_user_id;
        ELSE
            v_target_email := p_email;
        END IF;
    ELSE
        -- Only email provided (pending user)
        v_target_user_id := NULL;
        v_target_email := p_email;
    END IF;

    -- Check if notifications are enabled (skip if no user_id for preferences)
    IF v_target_user_id IS NOT NULL THEN
        v_should_send_web := public.should_send_notification(
            v_target_user_id,
            p_type,
            'web',
            p_scope,
            p_ws_id
        );
    ELSE
        -- For pending users, always create notification (they'll see it when they sign up)
        v_should_send_web := TRUE;
    END IF;

    -- Only create notification if enabled
    IF v_should_send_web THEN
        -- Create the notification
        INSERT INTO public.notifications (
            ws_id,
            user_id,
            email,
            type,
            code,
            title,
            description,
            data,
            entity_type,
            entity_id,
            created_by,
            scope,
            priority
        ) VALUES (
            p_ws_id,
            v_target_user_id,
            v_target_email,
            p_type,
            p_code,
            p_title,
            p_description,
            p_data,
            p_entity_type,
            p_entity_id,
            p_created_by,
            p_scope,
            p_priority
        )
        RETURNING id INTO v_notification_id;

        -- Check if email notifications are enabled
        IF v_target_user_id IS NOT NULL THEN
            v_should_send_email := public.should_send_notification(
                v_target_user_id,
                p_type,
                'email',
                p_scope,
                p_ws_id
            );
        ELSE
            -- For pending users, always send email
            v_should_send_email := TRUE;
        END IF;

        -- If email is enabled, add to delivery queue with batching
        IF v_should_send_email AND v_target_email IS NOT NULL THEN
            -- Get or create a batch for this user (10 minute window)
            -- Pass email parameter for pending users without user_id
            v_batch_id := public.get_or_create_notification_batch(
                p_ws_id,
                v_target_user_id,
                'email',
                10,
                v_target_email
            );

            -- Create delivery log entry
            INSERT INTO public.notification_delivery_log (
                notification_id,
                channel,
                status,
                batch_id
            ) VALUES (
                v_notification_id,
                'email',
                'pending',
                v_batch_id
            );

            -- Update batch notification count
            UPDATE public.notification_batches
            SET notification_count = notification_count + 1
            WHERE id = v_batch_id;
        END IF;

        RETURN v_notification_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Create trigger function for workspace email invites (pending users)
CREATE OR REPLACE FUNCTION public.notify_workspace_email_invite()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_name TEXT;
    v_inviter_name TEXT;
    v_inviter_email TEXT;
    v_notification_id UUID;
BEGIN
    -- Get workspace details
    SELECT name INTO v_workspace_name
    FROM public.workspaces
    WHERE id = NEW.ws_id;

    -- Get inviter name (if available)
    IF NEW.invited_by IS NOT NULL THEN
        -- Get display name from public.users
        SELECT display_name INTO v_inviter_name
        FROM public.users
        WHERE id = NEW.invited_by;

        -- Get email from auth.users if display name is null
        IF v_inviter_name IS NULL THEN
            SELECT email INTO v_inviter_email
            FROM auth.users
            WHERE id = NEW.invited_by;

            v_inviter_name := v_inviter_email;
        END IF;
    END IF;

    -- Create notification for the invitee (email-based, no user_id yet)
    -- Note: user-scoped notifications must have ws_id = NULL per constraint
    v_notification_id := public.create_notification(
        p_ws_id := NULL,
        p_user_id := NULL,  -- No user_id yet
        p_email := NEW.email,
        p_type := 'workspace_invite',
        p_code := 'workspace_invite',
        p_title := 'You have been invited to join a workspace',
        p_description := COALESCE(v_inviter_name, 'Someone') || ' invited you to join "' || v_workspace_name || '"',
        p_data := jsonb_build_object(
            'workspace_id', NEW.ws_id,
            'workspace_name', v_workspace_name,
            'inviter_id', NEW.invited_by,
            'inviter_name', v_inviter_name,
            'email', NEW.email,
            'role', NEW.role
        ),
        p_entity_type := 'workspace_invite',
        p_entity_id := NEW.ws_id,
        p_created_by := NEW.invited_by,
        p_scope := 'user',
        p_priority := 'high'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create trigger function for workspace user invites (existing users)
CREATE OR REPLACE FUNCTION public.notify_workspace_user_invite()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_name TEXT;
    v_invitee_email TEXT;
    v_notification_id UUID;
BEGIN
    -- Get workspace details
    SELECT name INTO v_workspace_name
    FROM public.workspaces
    WHERE id = NEW.ws_id;

    -- Get invitee email
    SELECT email INTO v_invitee_email
    FROM auth.users
    WHERE id = NEW.user_id;

    -- Create notification for the invitee
    -- Note: workspace_invites table doesn't track who sent the invite (no invited_by column)
    -- Note: user-scoped notifications must have ws_id = NULL per constraint
    -- Note: role column was removed from workspace_invites in migration 20251104101455
    v_notification_id := public.create_notification(
        p_ws_id := NULL,
        p_user_id := NEW.user_id,
        p_email := v_invitee_email,
        p_type := 'workspace_invite',
        p_code := 'workspace_invite',
        p_title := 'You have been invited to join a workspace',
        p_description := 'You have been invited to join "' || v_workspace_name || '"',
        p_data := jsonb_build_object(
            'workspace_id', NEW.ws_id,
            'workspace_name', v_workspace_name
        ),
        p_entity_type := 'workspace_invite',
        p_entity_id := NEW.ws_id,
        p_created_by := NULL,
        p_scope := 'user',
        p_priority := 'high'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Create triggers for workspace invites
DROP TRIGGER IF EXISTS trigger_notify_workspace_email_invite ON public.workspace_email_invites;
CREATE TRIGGER trigger_notify_workspace_email_invite
    AFTER INSERT ON public.workspace_email_invites
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_workspace_email_invite();

DROP TRIGGER IF EXISTS trigger_notify_workspace_user_invite ON public.workspace_invites;
CREATE TRIGGER trigger_notify_workspace_user_invite
    AFTER INSERT ON public.workspace_invites
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_workspace_user_invite();

-- Step 12: Create function to migrate email-based notifications to user_id when user signs up
CREATE OR REPLACE FUNCTION public.migrate_email_notifications_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    -- Update all notifications with matching email to add user_id
    UPDATE public.notifications
    SET user_id = NEW.id
    WHERE email = NEW.email
      AND user_id IS NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 13: Create trigger to auto-migrate notifications on user signup
DROP TRIGGER IF EXISTS trigger_migrate_email_notifications ON auth.users;
CREATE TRIGGER trigger_migrate_email_notifications
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.migrate_email_notifications_on_signup();

-- Step 14: Update existing notification functions to include code field

-- Update notify_task_assigned to include code
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_assigner_name TEXT;
    v_notification_id UUID;
BEGIN
    -- Get task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

    -- Get assigner name (if available)
    IF v_task_details.creator_id IS NOT NULL THEN
        SELECT COALESCE(full_name, email) INTO v_assigner_name
        FROM public.users
        WHERE id = v_task_details.creator_id;
    END IF;

    -- Create notification for the assignee
    v_notification_id := public.create_notification(
        p_ws_id := v_task_details.ws_id,
        p_user_id := NEW.user_id,
        p_type := 'task_assigned',
        p_code := 'task_assigned',
        p_title := 'You have been assigned to a task',
        p_description := v_assigner_name || ' assigned you to "' || v_task_details.task_name || '"',
        p_data := jsonb_build_object(
            'task_id', NEW.task_id,
            'task_name', v_task_details.task_name,
            'board_id', v_task_details.board_id,
            'board_name', v_task_details.board_name,
            'list_id', v_task_details.list_id,
            'list_name', v_task_details.list_name,
            'assigned_by', v_task_details.creator_id,
            'assigned_by_name', v_assigner_name
        ),
        p_entity_type := 'task',
        p_entity_id := NEW.task_id,
        p_created_by := v_task_details.creator_id,
        p_scope := 'workspace',
        p_priority := 'medium'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update notify_task_updated to include code
CREATE OR REPLACE FUNCTION public.notify_task_updated()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_assignee_id UUID;
    v_changes JSONB := '{}'::jsonb;
    v_has_changes BOOLEAN := false;
    v_title TEXT;
    v_description TEXT;
    v_updater_name TEXT;
    v_code TEXT;
BEGIN
    -- Only notify if task is actually updated (not inserted or deleted)
    IF TG_OP != 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- Get task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.id);

    -- Get updater name
    SELECT COALESCE(full_name, email) INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Check what changed and build notification
    IF OLD.completed != NEW.completed THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'completed', jsonb_build_object('old', OLD.completed, 'new', NEW.completed)
        );
    END IF;

    IF OLD.priority != NEW.priority OR (OLD.priority IS NULL AND NEW.priority IS NOT NULL) OR (OLD.priority IS NOT NULL AND NEW.priority IS NULL) THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'priority', jsonb_build_object('old', OLD.priority, 'new', NEW.priority)
        );
    END IF;

    IF OLD.end_date != NEW.end_date OR (OLD.end_date IS NULL AND NEW.end_date IS NOT NULL) OR (OLD.end_date IS NOT NULL AND NEW.end_date IS NULL) THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'due_date', jsonb_build_object('old', OLD.end_date, 'new', NEW.end_date)
        );
    END IF;

    IF OLD.list_id != NEW.list_id THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'list_id', jsonb_build_object('old', OLD.list_id, 'new', NEW.list_id)
        );
    END IF;

    -- Only create notifications if there are relevant changes
    IF v_has_changes THEN
        -- Create title and code based on changes
        IF NEW.completed AND NOT OLD.completed THEN
            v_title := 'Task marked as completed';
            v_code := 'task_completed';
            v_description := v_updater_name || ' completed "' || v_task_details.task_name || '"';
        ELSIF NOT NEW.completed AND OLD.completed THEN
            v_title := 'Task reopened';
            v_code := 'task_reopened';
            v_description := v_updater_name || ' reopened "' || v_task_details.task_name || '"';
        ELSIF OLD.priority != NEW.priority OR (OLD.priority IS NULL AND NEW.priority IS NOT NULL) OR (OLD.priority IS NOT NULL AND NEW.priority IS NULL) THEN
            v_title := 'Task priority changed';
            v_code := 'task_priority_changed';
            v_description := v_updater_name || ' changed the priority of "' || v_task_details.task_name || '"';
        ELSIF OLD.end_date != NEW.end_date OR (OLD.end_date IS NULL AND NEW.end_date IS NOT NULL) OR (OLD.end_date IS NOT NULL AND NEW.end_date IS NULL) THEN
            v_title := 'Task due date changed';
            v_code := 'task_due_date_changed';
            v_description := v_updater_name || ' changed the due date of "' || v_task_details.task_name || '"';
        ELSIF OLD.list_id != NEW.list_id THEN
            v_title := 'Task moved';
            v_code := 'task_moved';
            v_description := v_updater_name || ' moved "' || v_task_details.task_name || '"';
        ELSE
            v_title := 'Task updated';
            v_code := 'task_updated';
            v_description := v_updater_name || ' updated "' || v_task_details.task_name || '"';
        END IF;

        -- Notify all assignees
        FOR v_assignee_id IN
            SELECT user_id
            FROM public.task_assignees
            WHERE task_id = NEW.id
              AND user_id != auth.uid() -- Don't notify the person who made the change
        LOOP
            PERFORM public.create_notification(
                p_ws_id := v_task_details.ws_id,
                p_user_id := v_assignee_id,
                p_type := 'task_updated',
                p_code := v_code,
                p_title := v_title,
                p_description := v_description,
                p_data := jsonb_build_object(
                    'task_id', NEW.id,
                    'task_name', v_task_details.task_name,
                    'board_id', v_task_details.board_id,
                    'board_name', v_task_details.board_name,
                    'list_id', v_task_details.list_id,
                    'list_name', v_task_details.list_name,
                    'changes', v_changes,
                    'updated_by', auth.uid(),
                    'updated_by_name', v_updater_name
                ),
                p_entity_type := 'task',
                p_entity_id := NEW.id,
                p_created_by := auth.uid(),
                p_scope := 'workspace',
                p_priority := 'medium'
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON COLUMN public.notifications.code IS 'Translation key for i18n support (e.g., "workspace_invite", "task_assigned")';
COMMENT ON COLUMN public.notifications.email IS 'Email address for pending users who do not have accounts yet';
COMMENT ON FUNCTION public.get_user_email IS 'Helper function to get user email from auth.users - used in RLS policies (SECURITY DEFINER to access auth schema)';
COMMENT ON FUNCTION public.migrate_email_notifications_on_signup IS 'Automatically migrates email-based notifications to user_id when a user signs up';
COMMENT ON FUNCTION public.notify_workspace_email_invite IS 'Creates notifications for workspace email invites (pending users)';
COMMENT ON FUNCTION public.notify_workspace_user_invite IS 'Creates notifications for workspace user invites (existing users)';
