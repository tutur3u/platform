-- Fix full_name and email column reference errors in task history triggers
-- The full_name column is in user_private_details table, and email was also moved there
-- The public.users table only has: display_name, avatar_url, handle, bio, deleted, services
-- We'll use display_name from users table with 'Unknown user' as fallback

-- ============================================================================
-- Fix notify_task_updated function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_updated()
RETURNS TRIGGER AS $$
DECLARE
    v_has_changes BOOLEAN := false;
    v_changes JSONB := '{}'::jsonb;
    v_notification_type TEXT;
    v_task_details RECORD;
    v_updater_name TEXT;
    v_assignee_id UUID;
BEGIN
    -- Skip if this is a system update or no actual changes
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.id);

    -- Get updater name (only display_name exists in users table)
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

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'name',
            to_jsonb(OLD.name),
            to_jsonb(NEW.name),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- TASK DESCRIPTION CHANGE
    IF OLD.description IS DISTINCT FROM NEW.description THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'description', jsonb_build_object('old', OLD.description, 'new', NEW.description)
        );
        v_notification_type := 'task_description_changed';

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'description',
            to_jsonb(OLD.description),
            to_jsonb(NEW.description),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- TASK PRIORITY CHANGE
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'priority', jsonb_build_object('old', OLD.priority, 'new', NEW.priority)
        );
        v_notification_type := 'task_priority_changed';

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'priority',
            to_jsonb(OLD.priority),
            to_jsonb(NEW.priority),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- TASK DUE DATE CHANGE
    IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'end_date', jsonb_build_object('old', OLD.end_date, 'new', NEW.end_date)
        );
        v_notification_type := 'task_due_date_changed';

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'end_date',
            to_jsonb(OLD.end_date),
            to_jsonb(NEW.end_date),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- TASK START DATE CHANGE
    IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'start_date', jsonb_build_object('old', OLD.start_date, 'new', NEW.start_date)
        );
        v_notification_type := 'task_start_date_changed';

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'start_date',
            to_jsonb(OLD.start_date),
            to_jsonb(NEW.start_date),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- TASK ESTIMATION CHANGE
    IF OLD.estimation_points IS DISTINCT FROM NEW.estimation_points THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'estimation_points', jsonb_build_object('old', OLD.estimation_points, 'new', NEW.estimation_points)
        );
        v_notification_type := 'task_estimation_changed';

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'estimation_points',
            to_jsonb(OLD.estimation_points),
            to_jsonb(NEW.estimation_points),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- TASK MOVED (list_id change)
    IF OLD.list_id IS DISTINCT FROM NEW.list_id THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'list_id', jsonb_build_object('old', OLD.list_id, 'new', NEW.list_id)
        );
        v_notification_type := 'task_moved';

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'list_id',
            to_jsonb(OLD.list_id),
            to_jsonb(NEW.list_id),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- TASK COMPLETION STATUS CHANGE
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- Fix notify_task_label_added function
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

    -- Insert history record
    PERFORM public.insert_task_history(
        NEW.task_id,
        'label_added',
        NULL,
        NULL,
        to_jsonb(NEW.tag_id),
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
    );

    -- Get label name
    SELECT name INTO v_label_name
    FROM public.workspace_board_labels
    WHERE id = NEW.tag_id;

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
                'label_id', NEW.tag_id,
                'label_name', v_label_name,
                'board_id', v_task_details.board_id,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := NEW.task_id
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- Fix notify_task_label_removed function
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

    -- Insert history record
    PERFORM public.insert_task_history(
        OLD.task_id,
        'label_removed',
        NULL,
        to_jsonb(OLD.tag_id),
        NULL,
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
    );

    -- Get label name
    SELECT name INTO v_label_name
    FROM public.workspace_board_labels
    WHERE id = OLD.tag_id;

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
                'label_id', OLD.tag_id,
                'label_name', v_label_name,
                'board_id', v_task_details.board_id,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id
        );
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- Fix notify_task_project_linked function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_project_linked()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_task RECORD;
    v_project_name TEXT;
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

    -- Insert history record
    PERFORM public.insert_task_history(
        NEW.task_id,
        'project_linked',
        NULL,
        NULL,
        to_jsonb(NEW.project_id),
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
    );

    -- Get project name
    SELECT name INTO v_project_name
    FROM public.task_projects
    WHERE id = NEW.project_id;

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
            p_type := 'task_project_linked',
            p_title := 'Project linked to task',
            p_description := v_updater_name || ' linked project "' || v_project_name || '" to "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', NEW.task_id,
                'task_name', v_task.name,
                'project_id', NEW.project_id,
                'project_name', v_project_name,
                'board_id', v_task_details.board_id,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := NEW.task_id
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- Fix notify_task_project_unlinked function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_project_unlinked()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_task RECORD;
    v_project_name TEXT;
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

    -- Insert history record
    PERFORM public.insert_task_history(
        OLD.task_id,
        'project_unlinked',
        NULL,
        to_jsonb(OLD.project_id),
        NULL,
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
    );

    -- Get project name
    SELECT name INTO v_project_name
    FROM public.task_projects
    WHERE id = OLD.project_id;

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
            p_type := 'task_project_unlinked',
            p_title := 'Project unlinked from task',
            p_description := v_updater_name || ' unlinked project "' || v_project_name || '" from "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', OLD.task_id,
                'task_name', v_task.name,
                'project_id', OLD.project_id,
                'project_name', v_project_name,
                'board_id', v_task_details.board_id,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id
        );
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- Fix notify_task_assignee_removed function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_task_assignee_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_task_details RECORD;
    v_task RECORD;
    v_removed_user RECORD;
    v_updater_name TEXT;
    v_remaining_assignee_id UUID;
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

    -- Get removed user details
    SELECT id, display_name
    INTO v_removed_user
    FROM public.users
    WHERE id = OLD.user_id;

    -- Insert history record
    PERFORM public.insert_task_history(
        OLD.task_id,
        'assignee_removed',
        NULL,
        jsonb_build_object('user_id', v_removed_user.id, 'user_name', COALESCE(v_removed_user.display_name, 'Unknown user')),
        NULL,
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
    );

    -- Notify the removed user
    SELECT name INTO v_task
    FROM public.tasks
    WHERE id = OLD.task_id;

    PERFORM public.create_notification(
        p_ws_id := v_task_details.ws_id,
        p_user_id := OLD.user_id,
        p_type := 'task_assignee_removed',
        p_title := 'Removed from task',
        p_description := CASE
            WHEN auth.uid() = OLD.user_id THEN 'You were unassigned from "' || v_task.name || '"'
            ELSE v_updater_name || ' removed you from "' || v_task.name || '"'
        END,
        p_data := jsonb_build_object(
            'task_id', OLD.task_id,
            'task_name', v_task.name,
            'board_id', v_task_details.board_id,
            'removed_by', auth.uid(),
            'removed_by_name', v_updater_name
        ),
        p_entity_type := 'task',
        p_entity_id := OLD.task_id
    );

    -- Notify remaining assignees (except the person who removed)
    IF auth.uid() != OLD.user_id THEN
        FOR v_remaining_assignee_id IN
            SELECT user_id
            FROM public.task_assignees
            WHERE task_id = OLD.task_id
            AND user_id != auth.uid()
            AND user_id != OLD.user_id
        LOOP
            PERFORM public.create_notification(
                p_ws_id := v_task_details.ws_id,
                p_user_id := v_remaining_assignee_id,
                p_type := 'task_assignee_removed',
                p_title := 'Assignee removed from task',
                p_description := v_updater_name || ' removed ' || COALESCE(v_removed_user.display_name, 'Unknown user') || ' from "' || v_task.name || '"',
                p_data := jsonb_build_object(
                    'task_id', OLD.task_id,
                    'task_name', v_task.name,
                    'removed_user_id', OLD.user_id,
                    'removed_user_name', COALESCE(v_removed_user.display_name, 'Unknown user'),
                    'board_id', v_task_details.board_id,
                    'removed_by', auth.uid(),
                    'removed_by_name', v_updater_name
                ),
                p_entity_type := 'task',
                p_entity_id := OLD.task_id
            );
        END LOOP;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;
