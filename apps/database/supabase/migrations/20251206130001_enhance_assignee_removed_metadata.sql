-- Enhance assignee_removed trigger to include assignee_name in metadata
-- and avatar_url in old_value for consistency with assignee_added

CREATE OR REPLACE FUNCTION public.notify_task_assignee_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_task RECORD;
    v_task_details RECORD;
    v_removed_user RECORD;
    v_remaining_assignee_id UUID;
    v_updater_name TEXT;
    v_removed_user_name TEXT;
BEGIN
    -- Only for DELETE operations
    IF TG_OP != 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- Get task details
    SELECT * INTO v_task FROM public.tasks WHERE id = OLD.task_id;

    IF v_task IS NULL THEN
        RETURN OLD;
    END IF;

    -- Get removed user details
    SELECT * INTO v_removed_user FROM public.users WHERE id = OLD.user_id;
    v_removed_user_name := COALESCE(v_removed_user.display_name, v_removed_user.handle, 'Unknown');

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, handle, 'Unknown') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record with full assignee info and assignee_name in metadata
    PERFORM public.insert_task_history(
        OLD.task_id,
        'assignee_removed',
        NULL,
        jsonb_build_object(
            'user_id', v_removed_user.id,
            'user_name', v_removed_user_name,
            'avatar_url', v_removed_user.avatar_url
        ),
        NULL,
        jsonb_build_object(
            'ws_id', v_task_details.ws_id,
            'board_id', v_task_details.board_id,
            'assignee_name', v_removed_user_name
        )
    );

    -- Notify the removed user
    IF OLD.user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := OLD.user_id,
            p_type := 'task_assignee_removed',
            p_title := 'Removed from task',
            p_description := v_updater_name || ' removed you from "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', OLD.task_id,
                'task_name', v_task.name,
                'board_id', v_task_details.board_id,
                'removed_by', auth.uid(),
                'removed_by_name', v_updater_name,
                'action_url', '/' || v_task_details.ws_id || '/tasks/' || OLD.task_id
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id,
            p_scope := 'workspace'
        );
    END IF;

    -- Notify remaining assignees
    FOR v_remaining_assignee_id IN
        SELECT user_id
        FROM public.task_assignees
        WHERE task_id = OLD.task_id
          AND user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
          AND user_id != OLD.user_id
    LOOP
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_remaining_assignee_id,
            p_type := 'task_assignee_removed',
            p_title := 'Assignee removed from task',
            p_description := v_updater_name || ' removed ' || v_removed_user_name || ' from "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', OLD.task_id,
                'task_name', v_task.name,
                'removed_user_id', OLD.user_id,
                'removed_user_name', v_removed_user_name,
                'board_id', v_task_details.board_id,
                'removed_by', auth.uid(),
                'removed_by_name', v_updater_name,
                'action_url', '/' || v_task_details.ws_id || '/tasks/' || OLD.task_id
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id,
            p_scope := 'workspace'
        );
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_assignee_removed IS 'Enhanced trigger function that tracks assignee removal with full user details including name and avatar URL in old_value, and assignee_name in metadata for UI display consistency.';
