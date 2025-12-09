-- Add trigger for tracking when users are assigned to tasks
-- This complements the existing assignee_removed trigger

-- Create trigger function for assignee addition
CREATE OR REPLACE FUNCTION public.notify_task_assignee_added()
RETURNS TRIGGER AS $$
DECLARE
    v_task RECORD;
    v_task_details RECORD;
    v_assigned_user RECORD;
    v_other_assignee_id UUID;
    v_updater_name TEXT;
BEGIN
    -- Only for INSERT operations
    IF TG_OP != 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Get task details
    SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id;

    IF v_task IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get assigned user details
    SELECT * INTO v_assigned_user FROM public.users WHERE id = NEW.user_id;

    -- Get comprehensive task details (board, workspace, etc.)
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

    -- Get updater name (person who assigned)
    SELECT COALESCE(display_name, handle, 'Unknown') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record with full assignee info
    PERFORM public.insert_task_history(
        NEW.task_id,
        'assignee_added',
        NULL,
        NULL,
        jsonb_build_object(
            'user_id', v_assigned_user.id,
            'user_name', COALESCE(v_assigned_user.display_name, v_assigned_user.handle, 'Unknown'),
            'avatar_url', v_assigned_user.avatar_url
        ),
        jsonb_build_object(
            'ws_id', v_task_details.ws_id,
            'board_id', v_task_details.board_id,
            'assignee_name', COALESCE(v_assigned_user.display_name, v_assigned_user.handle, 'Unknown')
        )
    );

    -- Notify the assigned user (if not self-assigning)
    IF NEW.user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := NEW.user_id,
            p_type := 'task_assignee_added',
            p_title := 'Assigned to task',
            p_description := v_updater_name || ' assigned you to "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', NEW.task_id,
                'task_name', v_task.name,
                'board_id', v_task_details.board_id,
                'assigned_by', auth.uid(),
                'assigned_by_name', v_updater_name,
                'action_url', '/' || v_task_details.ws_id || '/tasks/' || NEW.task_id
            ),
            p_entity_type := 'task',
            p_entity_id := NEW.task_id,
            p_scope := 'workspace'
        );
    END IF;

    -- Notify other existing assignees
    FOR v_other_assignee_id IN
        SELECT user_id
        FROM public.task_assignees
        WHERE task_id = NEW.task_id
          AND user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
          AND user_id != NEW.user_id
    LOOP
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_other_assignee_id,
            p_type := 'task_assignee_added',
            p_title := 'New assignee added to task',
            p_description := v_updater_name || ' assigned ' || COALESCE(v_assigned_user.display_name, v_assigned_user.handle, 'Unknown') || ' to "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', NEW.task_id,
                'task_name', v_task.name,
                'assigned_user_id', NEW.user_id,
                'assigned_user_name', COALESCE(v_assigned_user.display_name, v_assigned_user.handle, 'Unknown'),
                'board_id', v_task_details.board_id,
                'assigned_by', auth.uid(),
                'assigned_by_name', v_updater_name,
                'action_url', '/' || v_task_details.ws_id || '/tasks/' || NEW.task_id
            ),
            p_entity_type := 'task',
            p_entity_id := NEW.task_id,
            p_scope := 'workspace'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for assignee addition
DROP TRIGGER IF EXISTS notify_on_task_assignee_added ON public.task_assignees;
CREATE TRIGGER notify_on_task_assignee_added
    AFTER INSERT ON public.task_assignees
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_assignee_added();

-- Add comment for documentation
COMMENT ON FUNCTION public.notify_task_assignee_added IS 'Trigger function that creates a task_history entry when a user is assigned to a task, capturing the assignee details including name and avatar URL. Also notifies the assigned user and other existing assignees.';
