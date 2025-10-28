-- Fix notify_task_assigned function to use display_name instead of full_name and email
-- The full_name and email columns are in user_private_details table, not public.users
-- The public.users table only has: display_name, avatar_url, handle, bio, deleted, services

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_assigner_name TEXT;
    v_notification_id UUID;
BEGIN
    -- Get task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

    -- Get assigner name (if available) - only display_name exists in users table
    IF v_task_details.creator_id IS NOT NULL THEN
        SELECT COALESCE(display_name, 'Unknown user') INTO v_assigner_name
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
