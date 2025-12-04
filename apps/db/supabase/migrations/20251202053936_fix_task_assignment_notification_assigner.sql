-- Fix task assignment/unassignment notifications:
-- 
-- Bug 1 (notify_task_assigned): Users receive notifications when they assign THEMSELVES to a task.
-- Fix: Skip notification if the assigner (auth.uid()) is the same as the assignee (NEW.user_id).
--
-- Bug 2 (notify_task_assigned): When John assigns a task (created by Jane) to Jill, the notification
-- was saying "Jane assigned you to task" instead of "John assigned you to task".
-- Fix: Use auth.uid() (actual assigner) instead of v_task_details.creator_id (task creator).
--
-- Bug 3 (notify_task_assignee_removed): Users receive notifications when they unassign THEMSELVES.
-- Fix: Skip notification entirely if the person removing is the same as the person being removed.

-- ============================================================================
-- FIX notify_task_assigned: Skip self-assignment notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_assigner_name TEXT;
    v_assigner_id UUID;
    v_notification_id UUID;
BEGIN
    -- Get the actual assigner (the person performing the assignment action)
    v_assigner_id := auth.uid();

    -- Skip notification if user is assigning themselves (no need to notify yourself)
    IF v_assigner_id IS NOT NULL AND v_assigner_id = NEW.user_id THEN
        RETURN NEW;
    END IF;

    -- Skip if this is a system operation (no authenticated user)
    IF v_assigner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

    -- Get assigner name (if available) - only display_name exists in users table
    SELECT COALESCE(display_name, 'Unknown user') INTO v_assigner_name
    FROM public.users
    WHERE id = v_assigner_id;

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
            'assigned_by', v_assigner_id,
            'assigned_by_name', v_assigner_name
        ),
        p_entity_type := 'task',
        p_entity_id := NEW.task_id,
        p_created_by := v_assigner_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_assigned IS 'Trigger function to create notifications when a task is assigned to a user. Uses auth.uid() to identify the actual assigner (not the task creator). Skips notification if user assigns themselves.';

-- ============================================================================
-- FIX notify_task_assignee_removed: Skip self-unassignment notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_assignee_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_task RECORD;
    v_removed_user RECORD;
    v_updater_name TEXT;
    v_updater_id UUID;
    v_remaining_assignee_id UUID;
BEGIN
    -- Get the person performing the removal
    v_updater_id := auth.uid();

    -- Skip if this is a system operation (no authenticated user)
    IF v_updater_id IS NULL THEN
        RETURN OLD;
    END IF;

    -- Fetch task details and removed user details once (used by both branches)
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);
    SELECT id, display_name INTO v_removed_user FROM public.users WHERE id = OLD.user_id;

    -- Insert history record (always, for audit purposes)
    PERFORM public.insert_task_history(
        OLD.task_id,
        'assignee_removed',
        NULL,
        jsonb_build_object('user_id', v_removed_user.id, 'user_name', COALESCE(v_removed_user.display_name, 'Unknown user')),
        NULL,
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
    );

    -- Skip notifications if user is unassigning themselves (no need to notify yourself)
    IF v_updater_id = OLD.user_id THEN
        RETURN OLD;
    END IF;

    -- Get updater name (only needed for notifications)
    SELECT COALESCE(display_name, 'Unknown user') INTO v_updater_name
    FROM public.users
    WHERE id = v_updater_id;

    -- Notify the removed user (only if someone else removed them)
    PERFORM public.create_notification(
        p_ws_id := v_task_details.ws_id,
        p_user_id := OLD.user_id,
        p_type := 'task_assignee_removed',
        p_title := 'Removed from task',
        p_description := v_updater_name || ' removed you from "' || v_task_details.task_name || '"',
        p_data := jsonb_build_object(
            'task_id', OLD.task_id,
            'task_name', v_task_details.task_name,
            'board_id', v_task_details.board_id,
            'removed_by', v_updater_id,
            'removed_by_name', v_updater_name
        ),
        p_entity_type := 'task',
        p_entity_id := OLD.task_id
    );

    -- Notify remaining assignees (except the person who performed the removal)
    FOR v_remaining_assignee_id IN
        SELECT user_id
        FROM public.task_assignees
        WHERE task_id = OLD.task_id
        AND user_id != v_updater_id
        AND user_id != OLD.user_id
    LOOP
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_remaining_assignee_id,
            p_type := 'task_assignee_removed',
            p_title := 'Assignee removed from task',
            p_description := v_updater_name || ' removed ' || COALESCE(v_removed_user.display_name, 'Unknown user') || ' from "' || v_task_details.task_name || '"',
            p_data := jsonb_build_object(
                'task_id', OLD.task_id,
                'task_name', v_task_details.task_name,
                'removed_user_id', OLD.user_id,
                'removed_user_name', COALESCE(v_removed_user.display_name, 'Unknown user'),
                'board_id', v_task_details.board_id,
                'removed_by', v_updater_id,
                'removed_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id
        );
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_assignee_removed IS 'Trigger function to create notifications when a user is removed from a task. Skips notification if user unassigns themselves. Still records history for audit purposes.';
