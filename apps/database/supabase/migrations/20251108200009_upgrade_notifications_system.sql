-- ============================================================================
-- UPGRADE NOTIFICATION SYSTEM TO SUPPORT BOTH WORKSPACE AND NON-WORKSPACE CONTEXTS
-- ============================================================================

-- Create enums for notification scope and priority
CREATE TYPE public.notification_scope AS ENUM ('user', 'workspace', 'system');
CREATE TYPE public.notification_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- ============================================================================
-- MODIFY NOTIFICATIONS TABLE
-- ============================================================================

-- Drop existing policies to modify table structure
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;

-- Modify notifications table to support non-workspace notifications
ALTER TABLE public.notifications
  ALTER COLUMN ws_id DROP NOT NULL;

-- Add new columns for improved notification system
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS scope public.notification_scope NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS priority public.notification_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_notifications_scope ON public.notifications(scope);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON public.notifications(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_parent_id ON public.notifications(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_scope_unread ON public.notifications(user_id, scope, read_at) WHERE read_at IS NULL;

-- Add check constraints
ALTER TABLE public.notifications
  ADD CONSTRAINT check_workspace_notifications_have_ws_id
    CHECK (scope != 'workspace' OR ws_id IS NOT NULL),
  ADD CONSTRAINT check_non_workspace_notifications_no_ws_id
    CHECK (scope = 'workspace' OR ws_id IS NULL);

-- ============================================================================
-- UPDATE RLS POLICIES FOR NOTIFICATIONS
-- ============================================================================

-- Policy: Users can view their own workspace notifications
CREATE POLICY "Users can view workspace notifications"
  ON public.notifications
  FOR SELECT
  USING (
    scope = 'workspace'
    AND user_id = auth.uid()
    AND ws_id IN (
      SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can view their own user-scoped notifications
CREATE POLICY "Users can view user notifications"
  ON public.notifications
  FOR SELECT
  USING (
    scope = 'user'
    AND user_id = auth.uid()
  );

-- Policy: Users can view system notifications
CREATE POLICY "Users can view system notifications"
  ON public.notifications
  FOR SELECT
  USING (
    scope = 'system'
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Policy: Users can update their own workspace notifications
CREATE POLICY "Users can update workspace notifications"
  ON public.notifications
  FOR UPDATE
  USING (
    scope = 'workspace'
    AND user_id = auth.uid()
    AND ws_id IN (
      SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    scope = 'workspace'
    AND user_id = auth.uid()
    AND ws_id IN (
      SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update their own user notifications
CREATE POLICY "Users can update user notifications"
  ON public.notifications
  FOR UPDATE
  USING (
    scope = 'user'
    AND user_id = auth.uid()
  )
  WITH CHECK (
    scope = 'user'
    AND user_id = auth.uid()
  );

-- Policy: System can insert notifications (used by triggers and backend functions)
CREATE POLICY "System can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (false);

-- Policy: Users can delete their own workspace notifications
CREATE POLICY "Users can delete workspace notifications"
  ON public.notifications
  FOR DELETE
  USING (
    scope = 'workspace'
    AND user_id = auth.uid()
    AND ws_id IN (
      SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete their own user notifications
CREATE POLICY "Users can delete user notifications"
  ON public.notifications
  FOR DELETE
  USING (
    scope = 'user'
    AND user_id = auth.uid()
  );

-- ============================================================================
-- MODIFY NOTIFICATION PREFERENCES TABLE
-- ============================================================================

-- Make ws_id nullable to support user-level preferences
ALTER TABLE public.notification_preferences
  ALTER COLUMN ws_id DROP NOT NULL;

-- Add new columns for enhanced preferences
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS scope public.notification_scope NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS digest_frequency TEXT CHECK (digest_frequency IN ('immediate', 'hourly', 'daily', 'weekly')) DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME,
  ADD COLUMN IF NOT EXISTS quiet_hours_end TIME,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Drop old unique constraint and create new one
ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_ws_id_user_id_event_type_channel_key;

-- Add new unique constraint that handles both workspace and user preferences
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_preferences_workspace_unique
  ON public.notification_preferences(ws_id, user_id, event_type, channel, scope)
  WHERE ws_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_preferences_user_unique
  ON public.notification_preferences(user_id, event_type, channel, scope)
  WHERE ws_id IS NULL;

-- Add check constraint
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT check_workspace_preferences_have_ws_id
    CHECK (scope != 'workspace' OR ws_id IS NOT NULL),
  ADD CONSTRAINT check_user_preferences_no_ws_id
    CHECK (scope = 'workspace' OR ws_id IS NULL);

-- Update RLS policies for preferences
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.notification_preferences;

-- New RLS policies for preferences
CREATE POLICY "Users can view workspace preferences"
  ON public.notification_preferences
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND (
      scope = 'workspace' AND ws_id IN (
        SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
      OR scope != 'workspace'
    )
  );

CREATE POLICY "Users can insert workspace preferences"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      scope = 'workspace' AND ws_id IN (
        SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
      OR scope != 'workspace'
    )
  );

CREATE POLICY "Users can update workspace preferences"
  ON public.notification_preferences
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND (
      scope = 'workspace' AND ws_id IN (
        SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
      OR scope != 'workspace'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (
      scope = 'workspace' AND ws_id IN (
        SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
      OR scope != 'workspace'
    )
  );

CREATE POLICY "Users can delete workspace preferences"
  ON public.notification_preferences
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND (
      scope = 'workspace' AND ws_id IN (
        SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
      OR scope != 'workspace'
    )
  );

-- ============================================================================
-- UPDATE HELPER FUNCTIONS
-- ============================================================================

-- Drop and recreate should_send_notification function to support new scope parameter
DROP FUNCTION IF EXISTS public.should_send_notification(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.should_send_notification(
  p_user_id UUID,
  p_event_type TEXT,
  p_channel TEXT,
  p_scope public.notification_scope DEFAULT 'workspace',
  p_ws_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_preference BOOLEAN;
  v_quiet_hours BOOLEAN := false;
  v_current_time TIME;
  v_quiet_start TIME;
  v_quiet_end TIME;
  v_timezone TEXT;
BEGIN
  -- Check for workspace-specific preference first
  IF p_scope = 'workspace' AND p_ws_id IS NOT NULL THEN
    SELECT enabled, quiet_hours_start, quiet_hours_end, timezone
    INTO v_preference, v_quiet_start, v_quiet_end, v_timezone
    FROM public.notification_preferences
    WHERE user_id = p_user_id
      AND ws_id = p_ws_id
      AND event_type = p_event_type
      AND channel = p_channel
      AND scope = 'workspace';
  END IF;

  -- Fall back to user-level preference if no workspace preference
  IF v_preference IS NULL THEN
    SELECT enabled, quiet_hours_start, quiet_hours_end, timezone
    INTO v_preference, v_quiet_start, v_quiet_end, v_timezone
    FROM public.notification_preferences
    WHERE user_id = p_user_id
      AND ws_id IS NULL
      AND event_type = p_event_type
      AND channel = p_channel
      AND scope IN ('user', 'system');
  END IF;

  -- Default to enabled if no preference found
  v_preference := COALESCE(v_preference, true);

  -- Check quiet hours if enabled
  IF v_preference AND v_quiet_start IS NOT NULL AND v_quiet_end IS NOT NULL THEN
    -- Get current time in user's timezone
    v_current_time := (now() AT TIME ZONE COALESCE(v_timezone, 'UTC'))::TIME;

    -- Check if current time is within quiet hours
    IF v_quiet_start <= v_quiet_end THEN
      -- Normal case: quiet hours don't span midnight
      v_quiet_hours := v_current_time >= v_quiet_start AND v_current_time <= v_quiet_end;
    ELSE
      -- Quiet hours span midnight
      v_quiet_hours := v_current_time >= v_quiet_start OR v_current_time <= v_quiet_end;
    END IF;

    -- Disable notification if in quiet hours
    IF v_quiet_hours THEN
      v_preference := false;
    END IF;
  END IF;

  RETURN v_preference;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate create_notification function to support new parameters
DROP FUNCTION IF EXISTS public.create_notification(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_scope public.notification_scope DEFAULT 'workspace',
  p_ws_id UUID DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_priority public.notification_priority DEFAULT 'medium',
  p_action_url TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_should_send_web BOOLEAN;
  v_should_send_email BOOLEAN;
  v_batch_id UUID;
BEGIN
  -- Validate scope and ws_id combination
  IF p_scope = 'workspace' AND p_ws_id IS NULL THEN
    RAISE EXCEPTION 'Workspace notifications must have a ws_id';
  END IF;

  IF p_scope != 'workspace' AND p_ws_id IS NOT NULL THEN
    RAISE EXCEPTION 'Non-workspace notifications must not have a ws_id';
  END IF;

  -- Check if web notifications are enabled for this user
  v_should_send_web := public.should_send_notification(p_user_id, p_type, 'web', p_scope, p_ws_id);

  -- Only create web notification if enabled
  IF v_should_send_web THEN
    -- Create the notification
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      description,
      scope,
      ws_id,
      data,
      entity_type,
      entity_id,
      created_by,
      priority,
      action_url,
      expires_at,
      parent_id
    ) VALUES (
      p_user_id,
      p_type,
      p_title,
      p_description,
      p_scope,
      p_ws_id,
      p_data,
      p_entity_type,
      p_entity_id,
      p_created_by,
      p_priority,
      p_action_url,
      p_expires_at,
      p_parent_id
    )
    RETURNING id INTO v_notification_id;

    -- Check if email notifications are enabled for this user
    v_should_send_email := public.should_send_notification(p_user_id, p_type, 'email', p_scope, p_ws_id);

    -- If email is enabled, add to delivery queue with batching
    IF v_should_send_email THEN
      -- Get or create a batch for this user (10 minute window)
      v_batch_id := public.get_or_create_notification_batch(
        COALESCE(p_ws_id, '00000000-0000-0000-0000-000000000000'::UUID),
        p_user_id,
        'email',
        10
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
      SET notification_count = notification_count + 1,
          updated_at = now()
      WHERE id = v_batch_id;
    END IF;

    RETURN v_notification_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATE EXISTING TRIGGER FUNCTIONS
-- ============================================================================

-- Update notify_task_assigned to use new function signature
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

  -- Create notification for the assignee using new signature
  v_notification_id := public.create_notification(
    p_user_id := NEW.user_id,
    p_type := 'task_assigned',
    p_title := 'You have been assigned to a task',
    p_description := COALESCE(v_assigner_name, 'Someone') || ' assigned you to "' || v_task_details.task_name || '"',
    p_scope := 'workspace',
    p_ws_id := v_task_details.ws_id,
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
    p_priority := 'medium',
    p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update notify_task_updated to use new function signature
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
  v_priority public.notification_priority := 'low';
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
    v_priority := 'medium';
    v_changes := v_changes || jsonb_build_object(
      'completed', jsonb_build_object('old', OLD.completed, 'new', NEW.completed)
    );
  END IF;

  IF OLD.priority != NEW.priority OR (OLD.priority IS NULL AND NEW.priority IS NOT NULL) OR (OLD.priority IS NOT NULL AND NEW.priority IS NULL) THEN
    v_has_changes := true;
    v_priority := 'medium';
    v_changes := v_changes || jsonb_build_object(
      'priority', jsonb_build_object('old', OLD.priority, 'new', NEW.priority)
    );
  END IF;

  IF OLD.end_date != NEW.end_date OR (OLD.end_date IS NULL AND NEW.end_date IS NOT NULL) OR (OLD.end_date IS NOT NULL AND NEW.end_date IS NULL) THEN
    v_has_changes := true;
    -- Higher priority if due date is soon
    IF NEW.end_date IS NOT NULL AND NEW.end_date <= (now() + interval '3 days') THEN
      v_priority := 'high';
    ELSE
      v_priority := 'medium';
    END IF;
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
    -- Create title based on changes
    IF NEW.completed AND NOT OLD.completed THEN
      v_title := 'Task marked as completed';
      v_description := COALESCE(v_updater_name, 'Someone') || ' completed "' || v_task_details.task_name || '"';
    ELSIF NOT NEW.completed AND OLD.completed THEN
      v_title := 'Task reopened';
      v_description := COALESCE(v_updater_name, 'Someone') || ' reopened "' || v_task_details.task_name || '"';
    ELSIF OLD.priority != NEW.priority OR (OLD.priority IS NULL AND NEW.priority IS NOT NULL) OR (OLD.priority IS NOT NULL AND NEW.priority IS NULL) THEN
      v_title := 'Task priority changed';
      v_description := COALESCE(v_updater_name, 'Someone') || ' changed the priority of "' || v_task_details.task_name || '"';
    ELSIF OLD.end_date != NEW.end_date OR (OLD.end_date IS NULL AND NEW.end_date IS NOT NULL) OR (OLD.end_date IS NOT NULL AND NEW.end_date IS NULL) THEN
      v_title := 'Task due date changed';
      v_description := COALESCE(v_updater_name, 'Someone') || ' changed the due date of "' || v_task_details.task_name || '"';
    ELSIF OLD.list_id != NEW.list_id THEN
      v_title := 'Task moved';
      v_description := COALESCE(v_updater_name, 'Someone') || ' moved "' || v_task_details.task_name || '"';
    ELSE
      v_title := 'Task updated';
      v_description := COALESCE(v_updater_name, 'Someone') || ' updated "' || v_task_details.task_name || '"';
    END IF;

    -- Notify all assignees
    FOR v_assignee_id IN
      SELECT user_id
      FROM public.task_assignees
      WHERE task_id = NEW.id
        AND user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    LOOP
      PERFORM public.create_notification(
        p_user_id := v_assignee_id,
        p_type := 'task_updated',
        p_title := v_title,
        p_description := v_description,
        p_scope := 'workspace',
        p_ws_id := v_task_details.ws_id,
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
        p_priority := v_priority,
        p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ADD NEW HELPER FUNCTIONS
-- ============================================================================

-- Function to create system-wide announcement
CREATE OR REPLACE FUNCTION public.create_system_announcement(
  p_title TEXT,
  p_description TEXT,
  p_priority public.notification_priority DEFAULT 'medium',
  p_action_url TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Create system notification for all users (user_id can be NULL for broadcast)
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    description,
    scope,
    priority,
    action_url,
    expires_at,
    data
  ) VALUES (
    NULL,  -- NULL means broadcast to all users
    'system_announcement',
    p_title,
    p_description,
    'system',
    p_priority,
    p_action_url,
    p_expires_at,
    p_data
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create user-level notification (account, security, etc.)
CREATE OR REPLACE FUNCTION public.create_user_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_priority public.notification_priority DEFAULT 'medium',
  p_action_url TEXT DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
BEGIN
  RETURN public.create_notification(
    p_user_id := p_user_id,
    p_type := p_type,
    p_title := p_title,
    p_description := p_description,
    p_scope := 'user',
    p_ws_id := NULL,
    p_data := p_data,
    p_priority := p_priority,
    p_action_url := p_action_url
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired notifications
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to archive old read notifications
CREATE OR REPLACE FUNCTION public.archive_old_notifications(p_days_threshold INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  v_archived_count INTEGER;
BEGIN
  UPDATE public.notifications
  SET archived_at = now()
  WHERE read_at IS NOT NULL
    AND read_at < (now() - (p_days_threshold || ' days')::interval)
    AND archived_at IS NULL;

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;
  RETURN v_archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATE COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TYPE public.notification_scope IS 'Notification scope: user (personal), workspace (workspace-specific), system (platform-wide)';
COMMENT ON TYPE public.notification_priority IS 'Notification priority: low, medium, high, urgent';

COMMENT ON COLUMN public.notifications.scope IS 'Notification scope: user (personal), workspace (workspace-specific), system (platform-wide)';
COMMENT ON COLUMN public.notifications.ws_id IS 'Workspace ID (required for workspace scope, NULL for user/system scope)';
COMMENT ON COLUMN public.notifications.priority IS 'Notification priority level';
COMMENT ON COLUMN public.notifications.action_url IS 'URL to navigate to when notification is clicked';
COMMENT ON COLUMN public.notifications.expires_at IS 'Expiration timestamp for temporary notifications';
COMMENT ON COLUMN public.notifications.parent_id IS 'Parent notification ID for threading/grouping notifications';
COMMENT ON COLUMN public.notifications.metadata IS 'Additional metadata for notification';
COMMENT ON COLUMN public.notifications.archived_at IS 'Timestamp when notification was archived';

COMMENT ON COLUMN public.notification_preferences.scope IS 'Preference scope: user or workspace';
COMMENT ON COLUMN public.notification_preferences.digest_frequency IS 'How often to send digest emails: immediate, hourly, daily, weekly';
COMMENT ON COLUMN public.notification_preferences.quiet_hours_start IS 'Start time for quiet hours (no notifications sent)';
COMMENT ON COLUMN public.notification_preferences.quiet_hours_end IS 'End time for quiet hours';
COMMENT ON COLUMN public.notification_preferences.timezone IS 'User timezone for quiet hours calculation';

COMMENT ON FUNCTION public.should_send_notification IS 'Checks if a notification should be sent based on user preferences, including workspace/user scope and quiet hours';
COMMENT ON FUNCTION public.create_notification IS 'Creates a notification with support for workspace, user, or system scope';
COMMENT ON FUNCTION public.create_system_announcement IS 'Creates a system-wide announcement visible to all users';
COMMENT ON FUNCTION public.create_user_notification IS 'Creates a user-level notification (account, security, etc.)';
COMMENT ON FUNCTION public.cleanup_expired_notifications IS 'Deletes expired notifications';
COMMENT ON FUNCTION public.archive_old_notifications IS 'Archives old read notifications';
