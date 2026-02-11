-- ============================================================================
-- FIX TASK UPDATE TRIGGER - VECTOR COMPARISON ERROR
-- ============================================================================
--
-- Problem: Bulk updates with .in() trigger "operator does not exist: extensions.vector = extensions.vector"
-- Solution: Check specific fields instead of comparing entire rows (avoids embedding vector column)
--
-- This migration updates the notify_task_updated trigger to avoid comparing the entire row,
-- which fails when the tasks table has an embedding column of type extensions.vector.
-- Instead, we explicitly check each field we care about.

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
    -- Skip if this is a system update (no authenticated user)
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- CRITICAL FIX: Check specific fields to avoid vector comparison error on bulk updates
    -- This prevents "operator does not exist: extensions.vector = extensions.vector" error
    -- when using bulk operations with .in() that would trigger row-level comparison
    IF (
        OLD.name IS NOT DISTINCT FROM NEW.name AND
        OLD.description IS NOT DISTINCT FROM NEW.description AND
        OLD.priority IS NOT DISTINCT FROM NEW.priority AND
        OLD.end_date IS NOT DISTINCT FROM NEW.end_date AND
        OLD.start_date IS NOT DISTINCT FROM NEW.start_date AND
        OLD.estimation_points IS NOT DISTINCT FROM NEW.estimation_points AND
        OLD.list_id IS NOT DISTINCT FROM NEW.list_id AND
        OLD.completed_at IS NOT DISTINCT FROM NEW.completed_at AND
        OLD.closed_at IS NOT DISTINCT FROM NEW.closed_at
    ) THEN
        -- No relevant changes detected, skip notification
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
    -- TRACK END DATE CHANGES (DUE DATE)
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
    -- TRACK ESTIMATION CHANGES
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
    -- TRACK LIST CHANGES (MOVING BETWEEN COLUMNS)
    -- ========================================================================
    IF OLD.list_id IS DISTINCT FROM NEW.list_id THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'list_id', jsonb_build_object('old', OLD.list_id, 'new', NEW.list_id)
        );
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_moved';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'list_id',
            to_jsonb(OLD.list_id),
            to_jsonb(NEW.list_id),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- TRACK COMPLETION STATUS CHANGES (completed_at timestamp)
    -- ========================================================================
    IF OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'completed_at', jsonb_build_object('old', OLD.completed_at, 'new', NEW.completed_at)
        );
        v_notification_type := CASE
            WHEN NEW.completed_at IS NOT NULL THEN 'task_completed'
            ELSE 'task_reopened'
        END;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'completed_at',
            to_jsonb(OLD.completed_at),
            to_jsonb(NEW.completed_at),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- TRACK CLOSED STATUS CHANGES (closed_at timestamp)
    -- ========================================================================
    IF OLD.closed_at IS DISTINCT FROM NEW.closed_at THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'closed_at', jsonb_build_object('old', OLD.closed_at, 'new', NEW.closed_at)
        );
        v_notification_type := CASE
            WHEN NEW.closed_at IS NOT NULL THEN 'task_closed'
            ELSE 'task_reopened'
        END;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'closed_at',
            to_jsonb(OLD.closed_at),
            to_jsonb(NEW.closed_at),
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
            AND user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
        LOOP
            PERFORM public.create_notification(
                p_ws_id := v_task_details.ws_id,
                p_user_id := v_assignee_id,
                p_email := NULL,
                p_type := v_notification_type,
                p_code := NULL,
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

COMMENT ON FUNCTION public.notify_task_updated IS 'Tracks task field changes and notifies assignees. FIXED: Explicitly checks specific fields instead of comparing entire rows to avoid "operator does not exist: extensions.vector = extensions.vector" error when using bulk operations with .in() clause. Uses correct column names: end_date, estimation_points, completed_at, closed_at.';
