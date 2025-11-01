-- Fix label trigger functions and improve notification display
-- This migration addresses:
-- 1. tag_id -> label_id field name correction
-- 2. workspace_board_labels -> workspace_task_labels table correction
-- 3. Add notifications for task title changes to assignees
-- 4. Enhance notification data to show before/after states clearly

-- ============================================================================
-- FIX: notify_task_label_added - Correct field and table names
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_label_added()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_task RECORD;
    v_label_name TEXT;
    v_updater_name TEXT;
    v_assignee_id UUID;
BEGIN
    -- Skip if this is a system update
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, 'Unknown user') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record (fixed: tag_id -> label_id)
    PERFORM public.insert_task_history(
        NEW.task_id,
        'label_added',
        NULL,
        NULL,
        to_jsonb(NEW.label_id),
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
    );

    -- Get label name (fixed: workspace_board_labels -> workspace_task_labels, tag_id -> label_id)
    SELECT name INTO v_label_name
    FROM public.workspace_task_labels
    WHERE id = NEW.label_id;

    -- Get task name
    SELECT name INTO v_task
    FROM public.tasks
    WHERE id = NEW.task_id;

    -- Notify all assignees except the person who made the change
    FOR v_assignee_id IN
        SELECT user_id
        FROM public.task_assignees
        WHERE task_id = NEW.task_id
        AND user_id != auth.uid()
    LOOP
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_assignee_id,
            p_type := 'task_label_added',
            p_title := 'Label added to task',
            p_description := v_updater_name || ' added label "' || v_label_name || '" to "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', NEW.task_id,
                'task_name', v_task.name,
                'label_id', NEW.label_id,
                'label_name', v_label_name,
                'board_id', v_task_details.board_id,
                'change_type', 'label_added',
                'new_value', v_label_name,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := NEW.task_id,
            p_created_by := auth.uid()
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX: notify_task_label_removed - Correct field and table names
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_label_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_task RECORD;
    v_label_name TEXT;
    v_updater_name TEXT;
    v_assignee_id UUID;
BEGIN
    -- Skip if this is a system update
    IF auth.uid() IS NULL THEN
        RETURN OLD;
    END IF;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, 'Unknown user') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record (fixed: tag_id -> label_id)
    PERFORM public.insert_task_history(
        OLD.task_id,
        'label_removed',
        NULL,
        to_jsonb(OLD.label_id),
        NULL,
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
    );

    -- Get label name (fixed: workspace_board_labels -> workspace_task_labels, tag_id -> label_id)
    SELECT name INTO v_label_name
    FROM public.workspace_task_labels
    WHERE id = OLD.label_id;

    -- Get task name
    SELECT name INTO v_task
    FROM public.tasks
    WHERE id = OLD.task_id;

    -- Notify all assignees except the person who made the change
    FOR v_assignee_id IN
        SELECT user_id
        FROM public.task_assignees
        WHERE task_id = OLD.task_id
        AND user_id != auth.uid()
    LOOP
        PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_assignee_id,
            p_type := 'task_label_removed',
            p_title := 'Label removed from task',
            p_description := v_updater_name || ' removed label "' || v_label_name || '" from "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', OLD.task_id,
                'task_name', v_task.name,
                'label_id', OLD.label_id,
                'label_name', v_label_name,
                'board_id', v_task_details.board_id,
                'change_type', 'label_removed',
                'old_value', v_label_name,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id,
            p_created_by := auth.uid()
        );
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATE: notify_task_updated - Add title change detection and improve data
-- ============================================================================
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
    -- TRACK DUE DATE CHANGES
    -- ========================================================================
    IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'due_date', jsonb_build_object('old', OLD.due_date, 'new', NEW.due_date)
        );
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_due_date_changed';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'due_date',
            to_jsonb(OLD.due_date),
            to_jsonb(NEW.due_date),
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
    -- TRACK ESTIMATION CHANGES
    -- ========================================================================
    IF OLD.estimation IS DISTINCT FROM NEW.estimation THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'estimation', jsonb_build_object('old', OLD.estimation, 'new', NEW.estimation)
        );
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_estimation_changed';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'estimation',
            to_jsonb(OLD.estimation),
            to_jsonb(NEW.estimation),
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

COMMENT ON FUNCTION public.notify_task_updated IS 'Tracks task field changes including title, description, priority, dates, estimation, and completion status. Notifies all assignees with detailed before/after state information.';
COMMENT ON FUNCTION public.notify_task_label_added IS 'Notifies assignees when a label is added to a task. Fixed to use label_id instead of tag_id and workspace_task_labels instead of workspace_board_labels.';
COMMENT ON FUNCTION public.notify_task_label_removed IS 'Notifies assignees when a label is removed from a task. Fixed to use label_id instead of tag_id and workspace_task_labels instead of workspace_board_labels.';
