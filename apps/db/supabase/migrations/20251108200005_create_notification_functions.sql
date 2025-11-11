-- Helper function to get workspace ID from task ID
CREATE OR REPLACE FUNCTION public.get_task_workspace_id(p_task_id UUID)
RETURNS UUID AS $$
DECLARE
    v_ws_id UUID;
BEGIN
    -- Harden search_path to prevent privilege escalation
    SET LOCAL search_path = pg_temp, public;

    SELECT wb.ws_id INTO v_ws_id
    FROM public.tasks t
    JOIN public.task_lists tl ON t.list_id = tl.id
    JOIN public.workspace_boards wb ON tl.board_id = wb.id
    WHERE t.id = p_task_id;

    RETURN v_ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get task details for notifications
CREATE OR REPLACE FUNCTION public.get_task_details(p_task_id UUID)
RETURNS TABLE (
    task_name TEXT,
    task_id UUID,
    list_id UUID,
    list_name TEXT,
    board_id UUID,
    board_name TEXT,
    ws_id UUID,
    creator_id UUID
) AS $$
BEGIN
    -- Harden search_path to prevent privilege escalation
    SET LOCAL search_path = pg_temp, public;

    RETURN QUERY
    SELECT
        t.name as task_name,
        t.id as task_id,
        tl.id as list_id,
        tl.name as list_name,
        wb.id as board_id,
        wb.name as board_name,
        wb.ws_id as ws_id,
        t.creator_id as creator_id
    FROM public.tasks t
    JOIN public.task_lists tl ON t.list_id = tl.id
    JOIN public.workspace_boards wb ON tl.board_id = wb.id
    WHERE t.id = p_task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a notification
CREATE OR REPLACE FUNCTION public.create_notification(
    p_ws_id UUID,
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_data JSONB DEFAULT '{}'::jsonb,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
    v_should_send_web BOOLEAN;
    v_should_send_email BOOLEAN;
    v_batch_id UUID;
BEGIN
    -- Harden search_path to prevent privilege escalation
    SET LOCAL search_path = pg_temp, public;

    -- Check if web notifications are enabled for this user
    v_should_send_web := public.should_send_notification(p_ws_id, p_user_id, p_type, 'web');

    -- Only create web notification if enabled
    IF v_should_send_web THEN
        -- Create the notification
        INSERT INTO public.notifications (
            ws_id,
            user_id,
            type,
            title,
            description,
            data,
            entity_type,
            entity_id,
            created_by
        ) VALUES (
            p_ws_id,
            p_user_id,
            p_type,
            p_title,
            p_description,
            p_data,
            p_entity_type,
            p_entity_id,
            p_created_by
        )
        RETURNING id INTO v_notification_id;

        -- Check if email notifications are enabled for this user
        v_should_send_email := public.should_send_notification(p_ws_id, p_user_id, p_type, 'email');

        -- If email is enabled, add to delivery queue with batching
        IF v_should_send_email THEN
            -- Get or create a batch for this user (10 minute window)
            v_batch_id := public.get_or_create_notification_batch(p_ws_id, p_user_id, 'email', 10);

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

-- Function to handle task assignment notifications
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_assigner_name TEXT;
    v_notification_id UUID;
BEGIN
    -- Harden search_path to prevent privilege escalation
    SET LOCAL search_path = pg_temp, public;

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
        p_created_by := v_task_details.creator_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle task update notifications
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
BEGIN
    -- Harden search_path to prevent privilege escalation
    SET LOCAL search_path = pg_temp, public;

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
        -- Create title based on changes
        IF NEW.completed AND NOT OLD.completed THEN
            v_title := 'Task marked as completed';
            v_description := v_updater_name || ' completed "' || v_task_details.task_name || '"';
        ELSIF NOT NEW.completed AND OLD.completed THEN
            v_title := 'Task reopened';
            v_description := v_updater_name || ' reopened "' || v_task_details.task_name || '"';
        ELSIF OLD.priority != NEW.priority OR (OLD.priority IS NULL AND NEW.priority IS NOT NULL) OR (OLD.priority IS NOT NULL AND NEW.priority IS NULL) THEN
            v_title := 'Task priority changed';
            v_description := v_updater_name || ' changed the priority of "' || v_task_details.task_name || '"';
        ELSIF OLD.end_date != NEW.end_date OR (OLD.end_date IS NULL AND NEW.end_date IS NOT NULL) OR (OLD.end_date IS NOT NULL AND NEW.end_date IS NULL) THEN
            v_title := 'Task due date changed';
            v_description := v_updater_name || ' changed the due date of "' || v_task_details.task_name || '"';
        ELSIF OLD.list_id != NEW.list_id THEN
            v_title := 'Task moved';
            v_description := v_updater_name || ' moved "' || v_task_details.task_name || '"';
        ELSE
            v_title := 'Task updated';
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
                p_created_by := auth.uid()
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_task_workspace_id IS 'Gets the workspace ID for a given task ID by traversing task -> list -> board -> workspace';
COMMENT ON FUNCTION public.get_task_details IS 'Gets comprehensive task details including board and workspace information';
COMMENT ON FUNCTION public.create_notification IS 'Creates a notification and handles delivery preferences (web/email batching)';
COMMENT ON FUNCTION public.notify_task_assigned IS 'Trigger function to create notifications when a task is assigned to a user';
COMMENT ON FUNCTION public.notify_task_updated IS 'Trigger function to create notifications when a task is updated (status, priority, due date, etc.)';
