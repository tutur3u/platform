-- ============================================================================
-- Comprehensive Task History Tracking & Enhanced Notifications
-- ============================================================================
-- This migration enhances task change detection to track ALL field changes
-- and creates persistent history records for complete audit trails

-- ============================================================================
-- HELPER FUNCTION: Insert Task History Record
-- ============================================================================
CREATE OR REPLACE FUNCTION public.insert_task_history(
    p_task_id UUID,
    p_change_type TEXT,
    p_field_name TEXT DEFAULT NULL,
    p_old_value JSONB DEFAULT NULL,
    p_new_value JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_history_id UUID;
BEGIN
    INSERT INTO public.task_history (
        task_id,
        changed_by,
        change_type,
        field_name,
        old_value,
        new_value,
        metadata
    ) VALUES (
        p_task_id,
        auth.uid(),
        p_change_type,
        p_field_name,
        p_old_value,
        p_new_value,
        p_metadata
    )
    RETURNING id INTO v_history_id;

    RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ENHANCED TASK UPDATE TRIGGER FUNCTION
-- ============================================================================
-- Tracks ALL field changes: name, description, priority, dates, estimation, list moves, completion
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
    -- Only notify if task is actually updated (not inserted or deleted)
    IF TG_OP != 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- Skip if no actual changes (same values)
    IF OLD IS NOT DISTINCT FROM NEW THEN
        RETURN NEW;
    END IF;

    -- Get task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.id);

    -- Get updater name
    SELECT COALESCE(display_name, full_name, email) INTO v_updater_name
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

        -- Insert history record
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

        -- Insert history record (don't store full description text for privacy/size)
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

        -- Insert history record
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

        -- Insert history record
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

        -- Insert history record
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

        -- Insert history record
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
            v_title := 'Task moved';
            v_description := v_updater_name || ' moved "' || NEW.name || '"';
        END IF;

        -- Insert history record
        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'list_id',
            to_jsonb(OLD.list_id),
            to_jsonb(NEW.list_id),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- COMPLETION STATUS CHANGE
    IF OLD.completed IS DISTINCT FROM NEW.completed THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'completed', jsonb_build_object('old', OLD.completed, 'new', NEW.completed)
        );

        IF NEW.completed AND NOT OLD.completed THEN
            v_notification_type := 'task_completed';
            v_title := 'Task marked as completed';
            v_description := v_updater_name || ' completed "' || NEW.name || '"';
        ELSIF NOT NEW.completed AND OLD.completed THEN
            v_notification_type := 'task_reopened';
            v_title := 'Task reopened';
            v_description := v_updater_name || ' reopened "' || NEW.name || '"';
        END IF;

        -- Insert history record
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
    -- CREATE NOTIFICATIONS
    -- ========================================================================
    IF v_has_changes THEN
        -- Default title/description if not set by specific change
        IF v_title IS NULL THEN
            v_title := 'Task updated';
            v_description := v_updater_name || ' updated "' || NEW.name || '"';
        END IF;

        -- Notify all assignees (except the person who made the change)
        FOR v_assignee_id IN
            SELECT user_id
            FROM public.task_assignees
            WHERE task_id = NEW.id
              AND user_id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
        LOOP
            PERFORM public.create_notification(
                p_ws_id := v_task_details.ws_id,
                p_user_id := v_assignee_id,
                p_type := v_notification_type,
                p_title := v_title,
                p_description := v_description,
                p_data := jsonb_build_object(
                    'task_id', NEW.id,
                    'task_name', NEW.name,
                    'board_id', v_task_details.board_id,
                    'board_name', v_task_details.board_name,
                    'list_id', v_task_details.list_id,
                    'list_name', v_task_details.list_name,
                    'changes', v_changes,
                    'updated_by', auth.uid(),
                    'updated_by_name', v_updater_name
                ),
                p_entity_type := 'task',
                p_entity_id := NEW.id,
                p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id || '?task=' || NEW.id,
                p_scope := 'workspace'
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger to ensure it's using the new function
DROP TRIGGER IF EXISTS notify_on_task_updated ON public.tasks;
CREATE TRIGGER notify_on_task_updated
    AFTER UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_updated();

-- ============================================================================
-- LABEL CHANGE TRIGGERS
-- ============================================================================

-- Function: Notify when label is added to task
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

    -- Get label details
    SELECT * INTO v_label FROM public.workspace_task_labels WHERE id = NEW.label_id;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, full_name, email) INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record
    PERFORM public.insert_task_history(
        NEW.task_id,
        'label_added',
        NULL,
        NULL,
        to_jsonb(v_label),
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'label_name', v_label.name)
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
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := NEW.task_id,
            p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id || '?task=' || NEW.task_id,
            p_scope := 'workspace'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Notify when label is removed from task
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

    -- Get label details
    SELECT * INTO v_label FROM public.workspace_task_labels WHERE id = OLD.label_id;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, full_name, email) INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record
    PERFORM public.insert_task_history(
        OLD.task_id,
        'label_removed',
        NULL,
        to_jsonb(v_label),
        NULL,
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'label_name', v_label.name)
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
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id,
            p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id || '?task=' || OLD.task_id,
            p_scope := 'workspace'
        );
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for label changes
DROP TRIGGER IF EXISTS notify_on_task_label_added ON public.task_labels;
CREATE TRIGGER notify_on_task_label_added
    AFTER INSERT ON public.task_labels
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_label_added();

DROP TRIGGER IF EXISTS notify_on_task_label_removed ON public.task_labels;
CREATE TRIGGER notify_on_task_label_removed
    AFTER DELETE ON public.task_labels
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_label_removed();

-- ============================================================================
-- PROJECT LINK TRIGGERS
-- ============================================================================

-- Function: Notify when task is linked to project
CREATE OR REPLACE FUNCTION public.notify_task_project_linked()
RETURNS TRIGGER AS $$
DECLARE
    v_task RECORD;
    v_project RECORD;
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

    -- Get project details
    SELECT * INTO v_project FROM public.task_projects WHERE id = NEW.project_id;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, full_name, email) INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record
    PERFORM public.insert_task_history(
        NEW.task_id,
        'project_linked',
        NULL,
        NULL,
        jsonb_build_object('project_id', v_project.id, 'project_name', v_project.name),
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'project_name', v_project.name)
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
            p_type := 'task_project_linked',
            p_title := 'Task linked to project',
            p_description := v_updater_name || ' linked "' || v_task.name || '" to project "' || v_project.name || '"',
            p_data := jsonb_build_object(
                'task_id', NEW.task_id,
                'task_name', v_task.name,
                'project_id', NEW.project_id,
                'project_name', v_project.name,
                'board_id', v_task_details.board_id,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := NEW.task_id,
            p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id || '?task=' || NEW.task_id,
            p_scope := 'workspace'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Notify when task is unlinked from project
CREATE OR REPLACE FUNCTION public.notify_task_project_unlinked()
RETURNS TRIGGER AS $$
DECLARE
    v_task RECORD;
    v_project RECORD;
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

    -- Get project details
    SELECT * INTO v_project FROM public.task_projects WHERE id = OLD.project_id;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, full_name, email) INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record
    PERFORM public.insert_task_history(
        OLD.task_id,
        'project_unlinked',
        NULL,
        jsonb_build_object('project_id', v_project.id, 'project_name', v_project.name),
        NULL,
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'project_name', v_project.name)
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
            p_type := 'task_project_unlinked',
            p_title := 'Task unlinked from project',
            p_description := v_updater_name || ' unlinked "' || v_task.name || '" from project "' || v_project.name || '"',
            p_data := jsonb_build_object(
                'task_id', OLD.task_id,
                'task_name', v_task.name,
                'project_id', OLD.project_id,
                'project_name', v_project.name,
                'board_id', v_task_details.board_id,
                'updated_by', auth.uid(),
                'updated_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id,
            p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id || '?task=' || OLD.task_id,
            p_scope := 'workspace'
        );
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for project links
DROP TRIGGER IF EXISTS notify_on_task_project_linked ON public.task_project_tasks;
CREATE TRIGGER notify_on_task_project_linked
    AFTER INSERT ON public.task_project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_project_linked();

DROP TRIGGER IF EXISTS notify_on_task_project_unlinked ON public.task_project_tasks;
CREATE TRIGGER notify_on_task_project_unlinked
    AFTER DELETE ON public.task_project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_project_unlinked();

-- ============================================================================
-- ASSIGNEE REMOVAL TRIGGER
-- ============================================================================

-- Function: Notify when assignee is removed from task
CREATE OR REPLACE FUNCTION public.notify_task_assignee_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_task RECORD;
    v_task_details RECORD;
    v_removed_user RECORD;
    v_remaining_assignee_id UUID;
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

    -- Get removed user details
    SELECT * INTO v_removed_user FROM public.users WHERE id = OLD.user_id;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);

    -- Get updater name
    SELECT COALESCE(display_name, full_name, email) INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Insert history record
    PERFORM public.insert_task_history(
        OLD.task_id,
        'assignee_removed',
        NULL,
        jsonb_build_object('user_id', v_removed_user.id, 'user_name', COALESCE(v_removed_user.display_name, v_removed_user.full_name, v_removed_user.email)),
        NULL,
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
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
                'removed_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id,
            p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id,
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
            p_description := v_updater_name || ' removed ' || COALESCE(v_removed_user.display_name, v_removed_user.full_name, v_removed_user.email) || ' from "' || v_task.name || '"',
            p_data := jsonb_build_object(
                'task_id', OLD.task_id,
                'task_name', v_task.name,
                'removed_user_id', OLD.user_id,
                'removed_user_name', COALESCE(v_removed_user.display_name, v_removed_user.full_name, v_removed_user.email),
                'board_id', v_task_details.board_id,
                'removed_by', auth.uid(),
                'removed_by_name', v_updater_name
            ),
            p_entity_type := 'task',
            p_entity_id := OLD.task_id,
            p_action_url := '/' || v_task_details.ws_id || '/tasks/boards/' || v_task_details.board_id || '?task=' || OLD.task_id,
            p_scope := 'workspace'
        );
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for assignee removal
DROP TRIGGER IF EXISTS notify_on_task_assignee_removed ON public.task_assignees;
CREATE TRIGGER notify_on_task_assignee_removed
    AFTER DELETE ON public.task_assignees
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_assignee_removed();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION public.insert_task_history IS 'Helper function to insert task history records with proper structure';
COMMENT ON FUNCTION public.notify_task_updated IS 'Enhanced trigger function tracking ALL task field changes with notifications';
COMMENT ON FUNCTION public.notify_task_label_added IS 'Trigger function for label addition with history tracking';
COMMENT ON FUNCTION public.notify_task_label_removed IS 'Trigger function for label removal with history tracking';
COMMENT ON FUNCTION public.notify_task_project_linked IS 'Trigger function for project linking with history tracking';
COMMENT ON FUNCTION public.notify_task_project_unlinked IS 'Trigger function for project unlinking with history tracking';
COMMENT ON FUNCTION public.notify_task_assignee_removed IS 'Trigger function for assignee removal with history tracking';
