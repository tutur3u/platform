-- Enhance task history triggers to include list names in metadata
-- This allows the UI to display actual column names like "To Do → In Progress"
-- instead of just showing UUIDs or generic labels

CREATE OR REPLACE FUNCTION public.notify_task_updated()
RETURNS TRIGGER AS $$
DECLARE
    v_has_changes BOOLEAN := false;
    v_changes JSONB := '{}'::jsonb;
    v_notification_type TEXT := 'task_updated';
    v_task_details RECORD;
    v_updater_name TEXT;
    v_assignee_id UUID;
    v_skip_embedding_only BOOLEAN := false;
    v_old_list_name TEXT;
    v_new_list_name TEXT;
BEGIN
    -- Check if this is ONLY an embedding update (AI background processing)
    -- In this case, skip logging to avoid noise from AI operations
    IF TG_OP = 'UPDATE' AND
       NEW.embedding IS DISTINCT FROM OLD.embedding AND
       NEW.name = OLD.name AND
       NEW.description IS NOT DISTINCT FROM OLD.description AND
       NEW.priority IS NOT DISTINCT FROM OLD.priority AND
       NEW.end_date IS NOT DISTINCT FROM OLD.end_date AND
       NEW.start_date IS NOT DISTINCT FROM OLD.start_date AND
       NEW.estimation_points IS NOT DISTINCT FROM OLD.estimation_points AND
       NEW.list_id IS NOT DISTINCT FROM OLD.list_id AND
       NEW.completed IS NOT DISTINCT FROM OLD.completed AND
       NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
        -- Only embedding changed, skip logging
        RETURN NEW;
    END IF;

    -- Note: We no longer skip when auth.uid() is NULL
    -- This ensures bulk operations are logged even without user context
    -- The changed_by column will be NULL in such cases
    IF auth.uid() IS NULL THEN
        RAISE LOG 'notify_task_updated: auth.uid() is NULL for task %, logging with anonymous user', NEW.id;
    END IF;

    -- Get comprehensive task details
    SELECT * INTO v_task_details FROM public.get_task_details(NEW.id);

    -- Get updater name (will be NULL if auth.uid() is NULL)
    SELECT COALESCE(display_name, 'Unknown user') INTO v_updater_name
    FROM public.users
    WHERE id = auth.uid();

    -- Default updater name if not found
    IF v_updater_name IS NULL THEN
        v_updater_name := 'System';
    END IF;

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
    -- TRACK END DATE CHANGES
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
    -- TRACK LIST_ID CHANGES (with list names in metadata)
    -- This tracks when tasks are moved between columns/lists
    -- ========================================================================
    IF OLD.list_id IS DISTINCT FROM NEW.list_id THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'list_id', jsonb_build_object('old', OLD.list_id, 'new', NEW.list_id)
        );
        IF v_notification_type = 'task_updated' THEN
            v_notification_type := 'task_moved';
        END IF;

        -- Lookup list names for better UI display
        SELECT name INTO v_old_list_name FROM public.task_lists WHERE id = OLD.list_id;
        SELECT name INTO v_new_list_name FROM public.task_lists WHERE id = NEW.list_id;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'list_id',
            to_jsonb(OLD.list_id),
            to_jsonb(NEW.list_id),
            jsonb_build_object(
                'ws_id', v_task_details.ws_id,
                'board_id', v_task_details.board_id,
                'old_list_name', COALESCE(v_old_list_name, 'Unknown'),
                'new_list_name', COALESCE(v_new_list_name, 'Unknown')
            )
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
    -- TRACK DELETED_AT CHANGES (for soft delete tracking)
    -- This tracks when tasks are soft deleted or restored
    -- ========================================================================
    IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
        v_has_changes := true;
        v_changes := v_changes || jsonb_build_object(
            'deleted_at', jsonb_build_object('old', OLD.deleted_at, 'new', NEW.deleted_at)
        );
        v_notification_type := CASE
            WHEN NEW.deleted_at IS NOT NULL THEN 'task_deleted'
            ELSE 'task_restored'
        END;

        PERFORM public.insert_task_history(
            NEW.id,
            'field_updated',
            'deleted_at',
            to_jsonb(OLD.deleted_at),
            to_jsonb(NEW.deleted_at),
            jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id)
        );
    END IF;

    -- ========================================================================
    -- CREATE NOTIFICATIONS FOR ALL ASSIGNEES
    -- ========================================================================
    IF v_has_changes THEN
        -- Notify all assignees except the person who made the change
        -- Use COALESCE to handle NULL auth.uid()
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

COMMENT ON FUNCTION public.notify_task_updated IS 'Enhanced trigger function tracking ALL task field changes including: name, description, priority, dates (end_date, start_date), estimation_points, list_id (with list names in metadata), completed, and deleted_at. Fixed to continue logging even when auth.uid() is NULL for bulk operations.';

-- Also update notify_task_created to include list_name
CREATE OR REPLACE FUNCTION public.notify_task_created()
RETURNS TRIGGER AS $$
DECLARE
  v_board_id UUID;
  v_ws_id UUID;
  v_list_name TEXT;
BEGIN
  -- Get the board_id and workspace_id for metadata
  SELECT tl.board_id, wb.ws_id, tl.name INTO v_board_id, v_ws_id, v_list_name
  FROM public.task_lists tl
  JOIN public.workspace_boards wb ON tl.board_id = wb.id
  WHERE tl.id = NEW.list_id;

  INSERT INTO public.task_history (
    task_id, changed_by, changed_at, change_type,
    field_name, old_value, new_value, metadata
  ) VALUES (
    NEW.id,
    NEW.creator_id,
    NEW.created_at,
    'task_created',
    NULL,
    NULL,
    to_jsonb(NEW.name),
    jsonb_build_object(
      'description', NEW.description,
      'priority', NEW.priority,
      'list_id', NEW.list_id,
      'list_name', v_list_name,
      'board_id', v_board_id,
      'workspace_id', v_ws_id,
      'estimation_points', NEW.estimation_points,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_task_created IS 'Trigger function that creates a task_history entry when a new task is created. Captures initial state including name, description, priority, list placement with list_name, estimation_points, start_date, and end_date.';
