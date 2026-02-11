-- Fix field name mismatches in notify_task_updated trigger
-- The tasks table uses 'end_date' not 'due_date' and 'estimation_points' not 'estimation'

CREATE OR REPLACE FUNCTION public.notify_task_updated()
RETURNS TRIGGER AS $$
DECLARE
    v_has_changes BOOLEAN := false;
    v_changes JSONB := '{}'::jsonb;
    v_notification_type TEXT := 'task_updated';
    v_task_details RECORD;
    v_updater_name TEXT;
    v_assignee_id UUID;
BEGIN
    -- Skip if this is a system update or task embedding update
    IF auth.uid() IS NULL OR (TG_OP = 'UPDATE' AND NEW.embedding IS DISTINCT FROM OLD.embedding AND
       NEW.name = OLD.name AND NEW.description IS NOT DISTINCT FROM OLD.description) THEN
        RETURN NEW;
    END IF;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.id);

    -- Get updater name
    SELECT COALESCE(display_name, 'Unknown user') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- ========================================================================
    -- TRACK TITLE/NAME CHANGES
    -- ========================================================================
    IF OLD.name IS DISTINCT FROM NEW.name THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'name', jsonb_build_object('old', OLD.name, 'new', NEW.name)
        );
        v_notification_type := 'task_title_changed';

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'name',
            to_jsonb(OLD.name),
            to_jsonb(NEW.name),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- TRACK DESCRIPTION CHANGES
    -- ========================================================================
    IF OLD.description IS DISTINCT FROM NEW.description THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'description', jsonb_build_object('old', OLD.description, 'new', NEW.description)
        );
        -- Only override type if not already set to title_changed
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_description_changed';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'description',
            to_jsonb(OLD.description),
            to_jsonb(NEW.description),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- TRACK PRIORITY CHANGES
    -- ========================================================================
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'priority', jsonb_build_object('old', OLD.priority, 'new', NEW.priority)
        );
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_priority_changed';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'priority',
            to_jsonb(OLD.priority),
            to_jsonb(NEW.priority),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- TRACK END DATE CHANGES (FIXED: was due_date)
    -- ========================================================================
    IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'end_date', jsonb_build_object('old', OLD.end_date, 'new', NEW.end_date)
        );
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_due_date_changed';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'end_date',
            to_jsonb(OLD.end_date),
            to_jsonb(NEW.end_date),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- TRACK START DATE CHANGES
    -- ========================================================================
    IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'start_date', jsonb_build_object('old', OLD.start_date, 'new', NEW.start_date)
        );
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_start_date_changed';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'start_date',
            to_jsonb(OLD.start_date),
            to_jsonb(NEW.start_date),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- TRACK ESTIMATION CHANGES (FIXED: was estimation, now estimation_points)
    -- ========================================================================
    IF OLD.estimation_points IS DISTINCT FROM NEW.estimation_points THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'estimation_points', jsonb_build_object('old', OLD.estimation_points, 'new', NEW.estimation_points)
        );
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_estimation_changed';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'estimation_points',
            to_jsonb(OLD.estimation_points),
            to_jsonb(NEW.estimation_points),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- TRACK COMPLETION STATUS CHANGES
    -- ========================================================================
    IF OLD.completed IS DISTINCT FROM NEW.completed THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'completed', jsonb_build_object('old', OLD.completed, 'new', NEW.completed)
        );
        v_notification_type := CASE
            WHEN NEW.completed = true THEN 'task_completed'
            ELSE 'task_reopened'
        END;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'completed',
            to_jsonb(OLD.completed),
            to_jsonb(NEW.completed),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- CREATE NOTIFICATIONS FOR ALL ASSIGNEES
    -- ========================================================================
    IF v_has_changes THEN
        -- Notify all assignees except the person who made the change
        FOR v_assignee_id IN
            SELECT user_id
            FROM public.task_assignees
            WHERE task_id = NEW.id
            AND user_id != auth.uid()
        LOOP
            PERFORM public.create_notification(
                p_ws_id := v_task_details.ws_id,
                p_user_id := v_assignee_id,
                p_type := v_notification_type,
                p_title := 'Task updated',
                p_description := v_updater_name || ' updated "' || NEW.name || '"',
                p_data := jsonb_build_object(
                    'task_id', NEW.id,
                    'task_name', NEW.name,
                    'changes', v_changes,
                    'change_type', v_notification_type,
                    'board_id', v_task_details.board_id,
                    'updated_by', auth.uid(),
                    'updated_by_name', v_updater_name
                ),
                p_entity_type := 'task',
                p_entity_id := NEW.id
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_updated IS 'Tracks task field changes including title, description, priority, dates (end_date, start_date), estimation_points, and completion status. Fixed to use correct column names: end_date instead of due_date, estimation_points instead of estimation.';
