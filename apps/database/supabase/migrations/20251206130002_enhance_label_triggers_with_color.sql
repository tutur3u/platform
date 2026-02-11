-- Enhance label triggers to include label_color in metadata for UI display

-- Update label_added trigger
CREATE OR REPLACE FUNCTION public.notify_task_label_added()
RETURNS TRIGGER AS $$
DECLARE
    v_task RECORD;
    v_label RECORD;
    v_task_details RECORD;
    v_assignee_id UUID;
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

    -- Get label details (includes color)
    SELECT * INTO v_label FROM public.workspace_task_labels WHERE id = NEW.label_id;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, handle, 'Unknown') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record with full label info including color
    PERFORM public.insert_task_history(
        NEW.task_id,
        'label_added',
        NULL,
        NULL,
        to_jsonb(v_label),
        jsonb_build_object(
            'ws_id', v_task_details.ws_id,
            'board_id', v_task_details.board_id,
            'label_name', v_label.name,
            'label_color', v_label.color
        )
    );

    -- Notify all assignees
    FOR v_assignee_id IN
        SELECT user_id
        FROM public.task_assignees
        WHERE task_id = NEW.task_id
          AND user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_assignee_id,
            p_type := 'task_label_added',
            p_title := 'Label added to task',
            p_description := v_updater_name || ' added label "' || v_label.name || '" to "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', NEW.task_id,
                'task_name', v_task.name,
                'label_id', NEW.label_id,
                'label_name', v_label.name,
                'label_color', v_label.color,
                'board_id', v_task_details.board_id,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name,
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

-- Update label_removed trigger
CREATE OR REPLACE FUNCTION public.notify_task_label_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_task RECORD;
    v_label RECORD;
    v_task_details RECORD;
    v_assignee_id UUID;
    v_updater_name TEXT;
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

    -- Get label details (includes color)
    SELECT * INTO v_label FROM public.workspace_task_labels WHERE id = OLD.label_id;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, handle, 'Unknown') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record with full label info including color
    PERFORM public.insert_task_history(
        OLD.task_id,
        'label_removed',
        NULL,
        to_jsonb(v_label),
        NULL,
        jsonb_build_object(
            'ws_id', v_task_details.ws_id,
            'board_id', v_task_details.board_id,
            'label_name', v_label.name,
            'label_color', v_label.color
        )
    );

    -- Notify all assignees
    FOR v_assignee_id IN
        SELECT user_id
        FROM public.task_assignees
        WHERE task_id = OLD.task_id
          AND user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_assignee_id,
            p_type := 'task_label_removed',
            p_title := 'Label removed from task',
            p_description := v_updater_name || ' removed label "' || v_label.name || '" from "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', OLD.task_id,
                'task_name', v_task.name,
                'label_id', OLD.label_id,
                'label_name', v_label.name,
                'label_color', v_label.color,
                'board_id', v_task_details.board_id,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name,
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

COMMENT ON FUNCTION public.notify_task_label_added IS 'Enhanced trigger function that tracks label addition with full label details including color in both new_value and metadata.';
COMMENT ON FUNCTION public.notify_task_label_removed IS 'Enhanced trigger function that tracks label removal with full label details including color in both old_value and metadata.';
