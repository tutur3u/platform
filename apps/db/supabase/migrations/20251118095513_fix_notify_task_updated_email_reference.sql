-- Fixes the notify_task_updated function to correctly reference user display names
-- and resolves other minor bugs in change tracking.
--
-- Problem:
-- 1. The previous migration (20251118000001) incorrectly re-introduced a
--    reference to the `email` column in the `public.users` table, which does not exist.
--    The `email` column is in `user_private_details`, and `public.users` only has `display_name`.
-- 2. The function was missing `SET LOCAL search_path` which can lead to security issues.
-- 3. The change tracking for `start_date` was logging the old value as the new value.
--
-- Solution:
-- 1. Update the query for `v_updater_name` to use `COALESCE(display_name, 'Unknown user')`.
-- 2. Add `SET LOCAL search_path = pg_temp, public;` to harden the function.
-- 3. Correct the `start_date` change tracking logic.

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
    v_notification_type TEXT := 'task_updated';
BEGIN
    -- Harden search_path to prevent privilege escalation
    SET LOCAL search_path = pg_temp, public;

    -- Only notify if task is actually updated (not inserted or deleted)
    IF TG_OP != 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- Check specific fields to avoid vector comparison error on bulk updates
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
        RETURN NEW;
    END IF;

    -- Get task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.id);

    -- Get updater name (FIXED: public.users only has display_name)
    SELECT COALESCE(display_name, 'Unknown user') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- ========================================================================
    -- TRACK FIELD CHANGES
    -- ========================================================================

    -- TASK NAME/TITLE CHANGE
    IF OLD.name IS DISTINCT FROM NEW.name THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'name', jsonb_build_object('old', OLD.name, 'new', NEW.name)
        );
        v_notification_type := 'task_title_changed';
        v_title := 'Task title changed';
        v_description := v_updater_name || ' changed the title of task from "' || OLD.name || '" to "' || NEW.name || '"';

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'name',
            to_jsonb(OLD.name),
            to_jsonb(NEW.name),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- DESCRIPTION CHANGE
    IF OLD.description IS DISTINCT FROM NEW.description THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'description', jsonb_build_object(
                'old', CASE WHEN OLD.description IS NOT NULL THEN true ELSE false END,
                'new', CASE WHEN NEW.description IS NOT NULL THEN true ELSE false END
            )
        );

        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_description_changed';
            v_title := 'Task description updated';
            v_description := v_updater_name || ' updated the description of "' || NEW.name || '"';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'description',
            to_jsonb(CASE WHEN OLD.description IS NOT NULL THEN 'has_content' ELSE NULL END),
            to_jsonb(CASE WHEN NEW.description IS NOT NULL THEN 'has_content' ELSE NULL END),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- PRIORITY CHANGE
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'priority', jsonb_build_object('old', OLD.priority, 'new', NEW.priority)
        );

        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_priority_changed';
            v_title := 'Task priority changed';
            v_description := v_updater_name || ' changed the priority of "' || NEW.name || '"';
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

    -- DUE DATE (end_date) CHANGE
    IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'due_date', jsonb_build_object('old', OLD.end_date, 'new', NEW.end_date)
        );

        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_due_date_changed';
            v_title := 'Task due date changed';
            v_description := v_updater_name || ' changed the due date of "' || NEW.name || '"';
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

    -- START DATE CHANGE
    IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'start_date', jsonb_build_object('old', OLD.start_date, 'new', NEW.start_date)
        );

        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_start_date_changed';
            v_title := 'Task start date changed';
            v_description := v_updater_name || ' changed the start date of "' || NEW.name || '"';
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

    -- ESTIMATION CHANGE
    IF OLD.estimation_points IS DISTINCT FROM NEW.estimation_points THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'estimation_points', jsonb_build_object('old', OLD.estimation_points, 'new', NEW.estimation_points)
        );

        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_estimation_changed';
            v_title := 'Task estimation changed';
            v_description := v_updater_name || ' changed the estimation of "' || NEW.name || '"';
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

    -- LIST MOVE (board column change)
    IF OLD.list_id IS DISTINCT FROM NEW.list_id THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'list_id', jsonb_build_object('old', OLD.list_id, 'new', NEW.list_id)
        );

        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_moved';
            v_title := 'Task moved to another list';
            v_description := v_updater_name || ' moved "' || NEW.name || '" to a different list';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'moved',
            'list_id',
            to_jsonb(OLD.list_id),
            to_jsonb(NEW.list_id),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- COMPLETION STATUS CHANGE
    IF OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'completed_at', jsonb_build_object('old', OLD.completed_at, 'new', NEW.completed_at)
        );

        IF NEW.completed_at IS NOT NULL THEN
            v_notification_type := 'task_completed';
            v_title := 'Task completed';
            v_description := v_updater_name || ' completed "' || NEW.name || '"';
        ELSE
            v_notification_type := 'task_reopened';
            v_title := 'Task reopened';
            v_description := v_updater_name || ' reopened "' || NEW.name || '"';
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            CASE WHEN NEW.completed_at IS NOT NULL THEN 'status_changed' ELSE 'status_changed' END,
            'completed_at',
            to_jsonb(OLD.completed_at),
            to_jsonb(NEW.completed_at),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- CLOSED STATUS CHANGE
    IF OLD.closed_at IS DISTINCT FROM NEW.closed_at THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'closed_at', jsonb_build_object('old', OLD.closed_at, 'new', NEW.closed_at)
        );

        IF NEW.closed_at IS NOT NULL THEN
            IF v_notification_type = 'task_updated' THEN
                v_notification_type := 'task_closed';
                v_title := 'Task closed';
                v_description := v_updater_name || ' closed "' || NEW.name || '"';
            END IF;
        ELSE
            IF v_notification_type = 'task_updated' THEN
                v_notification_type := 'task_reopened';
                v_title := 'Task reopened';
                v_description := v_updater_name || ' reopened "' || NEW.name || '"';
            END IF;
        END IF;

        PERFORM public.insert_task_history(
            NEW.id,
            'status_changed',
            'closed_at',
            to_jsonb(OLD.closed_at),
            to_jsonb(NEW.closed_at),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- CREATE NOTIFICATIONS FOR ASSIGNEES
    -- ========================================================================

    IF v_has_changes THEN
        FOR v_assignee_id IN
            SELECT user_id
            FROM public.task_assignees
            WHERE task_id = NEW.id
            AND user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
        LOOP
            INSERT INTO public.workspace_notifications (
                ws_id,
                user_id,
                title,
                description,
                notification_type,
                notification_code,
                task_id,
                metadata
            ) VALUES (
                v_task_details.ws_id,
                v_assignee_id,
                COALESCE(v_title, 'Task updated'),
                COALESCE(v_description, 'A task you are assigned to was updated'),
                v_notification_type,
                v_notification_type,
                NEW.id,
                jsonb_build_object(
                    'task_id', NEW.id,
                    'task_name', NEW.name,
                    'board_id', v_task_details.board_id,
                    'board_name', v_task_details.board_name,
                    'list_id', NEW.list_id,
                    'list_name', v_task_details.list_name,
                    'changes', v_changes,
                    'updated_by', auth.uid()
                )
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_updated IS 'Correctly handles user name lookup from display_name, hardens search_path, and fixes change tracking logic. Tracks task changes and notifies assignees.';
