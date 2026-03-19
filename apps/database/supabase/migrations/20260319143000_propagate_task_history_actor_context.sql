-- Propagate explicit task history actors for service-role writes.

CREATE OR REPLACE FUNCTION public.insert_task_history(
  p_task_id UUID,
  p_change_type TEXT,
  p_field_name TEXT DEFAULT NULL,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by UUID DEFAULT auth.uid()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history_id UUID;
  v_created_by UUID;
BEGIN
  v_created_by := p_created_by;

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
    v_created_by,
    p_change_type,
    p_field_name,
    p_old_value,
    p_new_value,
    p_metadata
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$;

COMMENT ON FUNCTION public.insert_task_history(UUID, TEXT, TEXT, JSONB, JSONB, JSONB, UUID) IS
'Inserts a task history record using an explicit actor value provided by the caller.';

CREATE OR REPLACE FUNCTION public.get_task_actor_display_name(
  p_actor_user_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT u.display_name FROM public.users u WHERE u.id = p_actor_user_id),
    (SELECT u.handle FROM public.users u WHERE u.id = p_actor_user_id),
    (SELECT upd.full_name FROM public.user_private_details upd WHERE upd.user_id = p_actor_user_id),
    (SELECT upd.email FROM public.user_private_details upd WHERE upd.user_id = p_actor_user_id),
    'System'
  )
$$;

COMMENT ON FUNCTION public.get_task_actor_display_name(UUID) IS
'Resolves the best available human-readable task actor name from public.users or user_private_details.';

CREATE OR REPLACE FUNCTION public.notify_task_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board_id UUID;
  v_ws_id UUID;
  v_list_name TEXT;
BEGIN
  SELECT tl.board_id, wb.ws_id, tl.name
  INTO v_board_id, v_ws_id, v_list_name
  FROM public.task_lists tl
  JOIN public.workspace_boards wb ON tl.board_id = wb.id
  WHERE tl.id = NEW.list_id;

  PERFORM public.insert_task_history(
    NEW.id,
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
    ),
    NEW.creator_id
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_changes BOOLEAN := false;
  v_changes JSONB := '{}'::jsonb;
  v_notification_type TEXT := 'task_updated';
  v_task_details RECORD;
  v_updater_name TEXT;
  v_assignee_id UUID;
  v_old_list_name TEXT;
  v_new_list_name TEXT;
  v_notification_data JSONB;
  v_actor_id UUID := auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND
     NEW.embedding::text IS DISTINCT FROM OLD.embedding::text AND
     NEW.name IS NOT DISTINCT FROM OLD.name AND
     NEW.description IS NOT DISTINCT FROM OLD.description AND
     NEW.priority IS NOT DISTINCT FROM OLD.priority AND
     NEW.end_date IS NOT DISTINCT FROM OLD.end_date AND
     NEW.start_date IS NOT DISTINCT FROM OLD.start_date AND
     NEW.estimation_points IS NOT DISTINCT FROM OLD.estimation_points AND
     NEW.list_id IS NOT DISTINCT FROM OLD.list_id AND
     NEW.completed IS NOT DISTINCT FROM OLD.completed AND
     NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND
     NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at AND
     NEW.closed_at IS NOT DISTINCT FROM OLD.closed_at AND
     NEW.sort_key IS NOT DISTINCT FROM OLD.sort_key THEN
    RETURN NEW;
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE LOG 'notify_task_updated: actor is NULL for task %, logging with anonymous user', NEW.id;
  END IF;

  SELECT * INTO v_task_details FROM public.get_task_details(NEW.id);

  SELECT COALESCE(display_name, 'Unknown user')
  INTO v_updater_name
  FROM public.users
  WHERE id = v_actor_id;

  IF v_updater_name IS NULL THEN
    v_updater_name := 'System';
  END IF;

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
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id),
      v_actor_id
    );
  END IF;

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
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id),
      v_actor_id
    );
  END IF;

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
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id),
      v_actor_id
    );
  END IF;

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
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id),
      v_actor_id
    );
  END IF;

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
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id),
      v_actor_id
    );
  END IF;

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
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id),
      v_actor_id
    );
  END IF;

  IF OLD.list_id IS DISTINCT FROM NEW.list_id THEN
    v_has_changes := true;
    v_changes := v_changes || jsonb_build_object(
      'list_id', jsonb_build_object('old', OLD.list_id, 'new', NEW.list_id)
    );
    IF v_notification_type = 'task_updated' THEN
      v_notification_type := 'task_moved';
    END IF;

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
      ),
      v_actor_id
    );
  END IF;

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
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id),
      v_actor_id
    );
  END IF;

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
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id),
      v_actor_id
    );
  END IF;

  IF v_has_changes THEN
    v_notification_data := jsonb_build_object(
      'task_id', NEW.id,
      'task_name', NEW.name,
      'changes', v_changes,
      'change_type', v_notification_type,
      'board_id', v_task_details.board_id,
      'updated_by', v_actor_id,
      'updated_by_name', v_updater_name
    );

    IF v_notification_type = 'task_moved' THEN
      v_notification_data := v_notification_data || jsonb_build_object(
        'old_list_name', COALESCE(v_old_list_name, 'Unknown'),
        'new_list_name', COALESCE(v_new_list_name, 'Unknown')
      );
    END IF;

    FOR v_assignee_id IN
      SELECT user_id
      FROM public.task_assignees
      WHERE task_id = NEW.id
        AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      PERFORM public.create_notification(
        p_ws_id := v_task_details.ws_id,
        p_user_id := v_assignee_id,
        p_email := NULL,
        p_type := v_notification_type,
        p_code := NULL,
        p_title := 'Task updated',
        p_description := v_updater_name || ' updated "' || NEW.name || '"',
        p_data := v_notification_data,
        p_entity_type := 'task',
        p_entity_id := NEW.id,
        p_created_by := v_actor_id,
        p_scope := 'workspace',
        p_priority := 'medium'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_label_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_label RECORD;
  v_task_details RECORD;
  v_assignee_id UUID;
  v_updater_name TEXT;
  v_actor_id UUID := auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id;
  IF v_task IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_label FROM public.workspace_task_labels WHERE id = NEW.label_id;
  SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

  SELECT COALESCE(display_name, handle, 'Unknown')
  INTO v_updater_name
  FROM public.users
  WHERE id = v_actor_id;

  IF v_updater_name IS NULL THEN
    v_updater_name := 'System';
  END IF;

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
    ),
    v_actor_id
  );

  FOR v_assignee_id IN
    SELECT user_id
    FROM public.task_assignees
    WHERE task_id = NEW.task_id
      AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
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
        'updated_by', v_actor_id,
        'updated_by_name', v_updater_name,
        'action_url', '/' || v_task_details.ws_id || '/tasks/' || NEW.task_id
      ),
      p_entity_type := 'task',
      p_entity_id := NEW.task_id,
      p_created_by := v_actor_id,
      p_scope := 'workspace'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_label_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_details RECORD;
  v_label_info RECORD;
  v_task_exists BOOLEAN;
  v_actor_id UUID := auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.tasks WHERE id = OLD.task_id) INTO v_task_exists;
  IF NOT v_task_exists THEN
    RETURN OLD;
  END IF;

  SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);
  IF v_task_details IS NULL OR v_task_details.board_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT id, name, color INTO v_label_info
  FROM public.workspace_task_labels
  WHERE id = OLD.label_id;

  PERFORM public.insert_task_history(
    OLD.task_id,
    'label_removed',
    NULL,
    jsonb_build_object(
      'id', OLD.label_id,
      'name', COALESCE(v_label_info.name, 'Unknown label'),
      'color', v_label_info.color
    ),
    NULL,
    jsonb_build_object(
      'ws_id', v_task_details.ws_id,
      'board_id', v_task_details.board_id,
      'label_name', COALESCE(v_label_info.name, 'Unknown label'),
      'label_color', v_label_info.color
    ),
    v_actor_id
  );

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_project_linked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_details RECORD;
  v_task RECORD;
  v_project_name TEXT;
  v_updater_name TEXT;
  v_assignee_id UUID;
  v_actor_id UUID := auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

  SELECT COALESCE(display_name, 'Unknown user')
  INTO v_updater_name
  FROM public.users
  WHERE id = v_actor_id;

  IF v_updater_name IS NULL THEN
    v_updater_name := 'System';
  END IF;

  SELECT name INTO v_project_name
  FROM public.task_projects
  WHERE id = NEW.project_id;

  SELECT name INTO v_task
  FROM public.tasks
  WHERE id = NEW.task_id;

  PERFORM public.insert_task_history(
    NEW.task_id,
    'project_linked',
    NULL,
    NULL,
    jsonb_build_object(
      'project_id', NEW.project_id,
      'project_name', COALESCE(v_project_name, 'Unknown project')
    ),
    jsonb_build_object(
      'ws_id', v_task_details.ws_id,
      'board_id', v_task_details.board_id,
      'project_name', COALESCE(v_project_name, 'Unknown project')
    ),
    v_actor_id
  );

  FOR v_assignee_id IN
    SELECT user_id
    FROM public.task_assignees
    WHERE task_id = NEW.task_id
      AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    PERFORM public.create_notification(
      p_ws_id := v_task_details.ws_id,
      p_user_id := v_assignee_id,
      p_type := 'task_project_linked',
      p_title := 'Project linked to task',
      p_description := v_updater_name || ' linked project "' || COALESCE(v_project_name, 'Unknown project') || '" to "' || v_task.name || '"',
      p_data := jsonb_build_object(
        'task_id', NEW.task_id,
        'task_name', v_task.name,
        'project_id', NEW.project_id,
        'project_name', COALESCE(v_project_name, 'Unknown project'),
        'board_id', v_task_details.board_id,
        'updated_by', v_actor_id,
        'updated_by_name', v_updater_name
      ),
      p_entity_type := 'task',
      p_entity_id := NEW.task_id,
      p_created_by := v_actor_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_project_unlinked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_details RECORD;
  v_project_info RECORD;
  v_task_exists BOOLEAN;
  v_actor_id UUID := auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.tasks WHERE id = OLD.task_id) INTO v_task_exists;
  IF NOT v_task_exists THEN
    RETURN OLD;
  END IF;

  SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);
  IF v_task_details IS NULL OR v_task_details.board_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT id, name INTO v_project_info
  FROM public.task_projects
  WHERE id = OLD.project_id;

  PERFORM public.insert_task_history(
    OLD.task_id,
    'project_unlinked',
    NULL,
    jsonb_build_object(
      'project_id', OLD.project_id,
      'project_name', COALESCE(v_project_info.name, 'Unknown project')
    ),
    NULL,
    jsonb_build_object(
      'ws_id', v_task_details.ws_id,
      'board_id', v_task_details.board_id,
      'project_name', COALESCE(v_project_info.name, 'Unknown project')
    ),
    v_actor_id
  );

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_assignee_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_task_details RECORD;
  v_assigned_user RECORD;
  v_other_assignee_id UUID;
  v_updater_name TEXT;
  v_actor_id UUID := auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id;
  IF v_task IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_assigned_user FROM public.users WHERE id = NEW.user_id;
  SELECT * INTO v_task_details FROM public.get_task_details(NEW.task_id);

  SELECT COALESCE(display_name, handle, 'Unknown')
  INTO v_updater_name
  FROM public.users
  WHERE id = v_actor_id;

  IF v_updater_name IS NULL THEN
    v_updater_name := 'System';
  END IF;

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
    ),
    v_actor_id
  );

  IF NEW.user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
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
        'assigned_by', v_actor_id,
        'assigned_by_name', v_updater_name,
        'action_url', '/' || v_task_details.ws_id || '/tasks/' || NEW.task_id
      ),
      p_entity_type := 'task',
      p_entity_id := NEW.task_id,
      p_created_by := v_actor_id,
      p_scope := 'workspace'
    );
  END IF;

  FOR v_other_assignee_id IN
    SELECT user_id
    FROM public.task_assignees
    WHERE task_id = NEW.task_id
      AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
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
        'assigned_by', v_actor_id,
        'assigned_by_name', v_updater_name,
        'action_url', '/' || v_task_details.ws_id || '/tasks/' || NEW.task_id
      ),
      p_entity_type := 'task',
      p_entity_id := NEW.task_id,
      p_created_by := v_actor_id,
      p_scope := 'workspace'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_assignee_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_details RECORD;
  v_user_info RECORD;
  v_task_exists BOOLEAN;
  v_actor_id UUID := auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.tasks WHERE id = OLD.task_id) INTO v_task_exists;
  IF NOT v_task_exists THEN
    RETURN OLD;
  END IF;

  SELECT * INTO v_task_details FROM public.get_task_details(OLD.task_id);
  IF v_task_details IS NULL OR v_task_details.board_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT id, display_name, avatar_url INTO v_user_info
  FROM public.users
  WHERE id = OLD.user_id;

  PERFORM public.insert_task_history(
    OLD.task_id,
    'assignee_removed',
    NULL,
    jsonb_build_object(
      'user_id', OLD.user_id,
      'user_name', COALESCE(v_user_info.display_name, 'Unknown user'),
      'avatar_url', v_user_info.avatar_url
    ),
    NULL,
    jsonb_build_object(
      'ws_id', v_task_details.ws_id,
      'board_id', v_task_details.board_id,
      'assignee_name', COALESCE(v_user_info.display_name, 'Unknown user')
    ),
    v_actor_id
  );

  RETURN OLD;
END;
$$;

DROP FUNCTION IF EXISTS public.update_task_with_relations(UUID, JSONB, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID[], BOOLEAN);

CREATE OR REPLACE FUNCTION public.update_task_with_relations(
  p_task_id UUID,
  p_task_updates JSONB,
  p_assignee_ids UUID[] DEFAULT NULL,
  p_replace_assignees BOOLEAN DEFAULT FALSE,
  p_label_ids UUID[] DEFAULT NULL,
  p_replace_labels BOOLEAN DEFAULT FALSE,
  p_project_ids UUID[] DEFAULT NULL,
  p_replace_projects BOOLEAN DEFAULT FALSE,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old_task public.tasks%rowtype;
  updated_task public.tasks%rowtype;
  v_actor_id UUID;
  v_use_explicit_actor BOOLEAN := p_actor_user_id IS NOT NULL AND auth.uid() IS NULL;
  v_task_details RECORD;
  v_updater_name TEXT;
  v_changes JSONB := '{}'::jsonb;
  v_notification_type TEXT := 'task_updated';
  v_has_changes BOOLEAN := FALSE;
  v_old_list_name TEXT;
  v_new_list_name TEXT;
  v_notification_data JSONB;
  v_assignee_id UUID;
  v_old_label_ids UUID[] := ARRAY[]::UUID[];
  v_new_label_ids UUID[] := ARRAY[]::UUID[];
  v_old_project_ids UUID[] := ARRAY[]::UUID[];
  v_new_project_ids UUID[] := ARRAY[]::UUID[];
  v_old_assignee_ids UUID[] := ARRAY[]::UUID[];
  v_new_assignee_ids UUID[] := ARRAY[]::UUID[];
  v_label RECORD;
  v_project RECORD;
  v_assigned_user RECORD;
BEGIN
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'Task ID is required';
  END IF;

  IF p_task_updates ? 'name' AND jsonb_typeof(p_task_updates->'name') = 'null' THEN
    RAISE EXCEPTION 'Task name cannot be null';
  END IF;

  IF p_task_updates ? 'completed' AND jsonb_typeof(p_task_updates->'completed') = 'null' THEN
    RAISE EXCEPTION 'Task completed cannot be null';
  END IF;

  v_actor_id := COALESCE(p_actor_user_id, auth.uid());

  SELECT * INTO v_old_task
  FROM public.tasks
  WHERE id = p_task_id;

  IF v_old_task IS NULL THEN
    RETURN;
  END IF;

  IF p_replace_assignees THEN
    SELECT COALESCE(array_agg(user_id), ARRAY[]::UUID[])
    INTO v_old_assignee_ids
    FROM public.task_assignees
    WHERE task_id = p_task_id;
  END IF;

  IF p_replace_labels THEN
    SELECT COALESCE(array_agg(label_id), ARRAY[]::UUID[])
    INTO v_old_label_ids
    FROM public.task_labels
    WHERE task_id = p_task_id;
  END IF;

  IF p_replace_projects THEN
    SELECT COALESCE(array_agg(project_id), ARRAY[]::UUID[])
    INTO v_old_project_ids
    FROM public.task_project_tasks
    WHERE task_id = p_task_id;
  END IF;

  UPDATE public.tasks
  SET
    name = CASE
      WHEN p_task_updates ? 'name' THEN p_task_updates->>'name'
      ELSE tasks.name
    END,
    description = CASE
      WHEN p_task_updates ? 'description' THEN p_task_updates->>'description'
      ELSE tasks.description
    END,
    priority = CASE
      WHEN p_task_updates ? 'priority' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'priority') = 'null' THEN NULL
          ELSE (p_task_updates->>'priority')::public.task_priority
        END
      ELSE tasks.priority
    END,
    start_date = CASE
      WHEN p_task_updates ? 'start_date' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'start_date') = 'null' THEN NULL
          ELSE (p_task_updates->>'start_date')::timestamptz
        END
      ELSE tasks.start_date
    END,
    end_date = CASE
      WHEN p_task_updates ? 'end_date' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'end_date') = 'null' THEN NULL
          ELSE (p_task_updates->>'end_date')::timestamptz
        END
      ELSE tasks.end_date
    END,
    completed = CASE
      WHEN p_task_updates ? 'completed' THEN (p_task_updates->>'completed')::boolean
      ELSE tasks.completed
    END,
    completed_at = CASE
      WHEN p_task_updates ? 'completed_at' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'completed_at') = 'null' THEN NULL
          ELSE (p_task_updates->>'completed_at')::timestamptz
        END
      ELSE tasks.completed_at
    END,
    closed_at = CASE
      WHEN p_task_updates ? 'closed_at' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'closed_at') = 'null' THEN NULL
          ELSE (p_task_updates->>'closed_at')::timestamptz
        END
      ELSE tasks.closed_at
    END,
    list_id = CASE
      WHEN p_task_updates ? 'list_id' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'list_id') = 'null' THEN NULL
          ELSE (p_task_updates->>'list_id')::uuid
        END
      ELSE tasks.list_id
    END,
    estimation_points = CASE
      WHEN p_task_updates ? 'estimation_points' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'estimation_points') = 'null' THEN NULL
          ELSE (p_task_updates->>'estimation_points')::smallint
        END
      ELSE tasks.estimation_points
    END,
    sort_key = CASE
      WHEN p_task_updates ? 'sort_key' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'sort_key') = 'null' THEN NULL
          ELSE (p_task_updates->>'sort_key')::bigint
        END
      ELSE tasks.sort_key
    END,
    deleted_at = CASE
      WHEN p_task_updates ? 'deleted_at' THEN
        CASE
          WHEN jsonb_typeof(p_task_updates->'deleted_at') = 'null' THEN NULL
          ELSE (p_task_updates->>'deleted_at')::timestamptz
        END
      ELSE tasks.deleted_at
    END
  WHERE tasks.id = p_task_id
  RETURNING tasks.* INTO updated_task;

  IF updated_task IS NULL THEN
    RETURN;
  END IF;

  IF v_use_explicit_actor THEN
    SELECT * INTO v_task_details FROM public.get_task_details(p_task_id);
    v_updater_name := public.get_task_actor_display_name(v_actor_id);

    IF v_old_task.name IS DISTINCT FROM updated_task.name THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', v_old_task.name, 'new', updated_task.name));
      v_notification_type := 'task_title_changed';
      PERFORM public.insert_task_history(p_task_id, 'field_updated', 'name', to_jsonb(v_old_task.name), to_jsonb(updated_task.name), jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id), v_actor_id);
    END IF;

    IF v_old_task.description IS DISTINCT FROM updated_task.description THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('old', v_old_task.description, 'new', updated_task.description));
      IF v_notification_type = 'task_updated' THEN
        v_notification_type := 'task_description_changed';
      END IF;
      PERFORM public.insert_task_history(p_task_id, 'field_updated', 'description', to_jsonb(v_old_task.description), to_jsonb(updated_task.description), jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id), v_actor_id);
    END IF;

    IF v_old_task.priority IS DISTINCT FROM updated_task.priority THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('priority', jsonb_build_object('old', v_old_task.priority, 'new', updated_task.priority));
      IF v_notification_type = 'task_updated' THEN
        v_notification_type := 'task_priority_changed';
      END IF;
      PERFORM public.insert_task_history(p_task_id, 'field_updated', 'priority', to_jsonb(v_old_task.priority), to_jsonb(updated_task.priority), jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id), v_actor_id);
    END IF;

    IF v_old_task.end_date IS DISTINCT FROM updated_task.end_date THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('end_date', jsonb_build_object('old', v_old_task.end_date, 'new', updated_task.end_date));
      IF v_notification_type = 'task_updated' THEN
        v_notification_type := 'task_due_date_changed';
      END IF;
      PERFORM public.insert_task_history(p_task_id, 'field_updated', 'end_date', to_jsonb(v_old_task.end_date), to_jsonb(updated_task.end_date), jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id), v_actor_id);
    END IF;

    IF v_old_task.start_date IS DISTINCT FROM updated_task.start_date THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('start_date', jsonb_build_object('old', v_old_task.start_date, 'new', updated_task.start_date));
      IF v_notification_type = 'task_updated' THEN
        v_notification_type := 'task_start_date_changed';
      END IF;
      PERFORM public.insert_task_history(p_task_id, 'field_updated', 'start_date', to_jsonb(v_old_task.start_date), to_jsonb(updated_task.start_date), jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id), v_actor_id);
    END IF;

    IF v_old_task.estimation_points IS DISTINCT FROM updated_task.estimation_points THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('estimation_points', jsonb_build_object('old', v_old_task.estimation_points, 'new', updated_task.estimation_points));
      IF v_notification_type = 'task_updated' THEN
        v_notification_type := 'task_estimation_changed';
      END IF;
      PERFORM public.insert_task_history(p_task_id, 'field_updated', 'estimation_points', to_jsonb(v_old_task.estimation_points), to_jsonb(updated_task.estimation_points), jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id), v_actor_id);
    END IF;

    IF v_old_task.list_id IS DISTINCT FROM updated_task.list_id THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('list_id', jsonb_build_object('old', v_old_task.list_id, 'new', updated_task.list_id));
      IF v_notification_type = 'task_updated' THEN
        v_notification_type := 'task_moved';
      END IF;
      SELECT name INTO v_old_list_name FROM public.task_lists WHERE id = v_old_task.list_id;
      SELECT name INTO v_new_list_name FROM public.task_lists WHERE id = updated_task.list_id;
      PERFORM public.insert_task_history(
        p_task_id,
        'field_updated',
        'list_id',
        to_jsonb(v_old_task.list_id),
        to_jsonb(updated_task.list_id),
        jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'old_list_name', COALESCE(v_old_list_name, 'Unknown'), 'new_list_name', COALESCE(v_new_list_name, 'Unknown')),
        v_actor_id
      );
    END IF;

    IF v_old_task.completed IS DISTINCT FROM updated_task.completed THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('completed', jsonb_build_object('old', v_old_task.completed, 'new', updated_task.completed));
      v_notification_type := CASE WHEN updated_task.completed = TRUE THEN 'task_completed' ELSE 'task_reopened' END;
      PERFORM public.insert_task_history(p_task_id, 'field_updated', 'completed', to_jsonb(v_old_task.completed), to_jsonb(updated_task.completed), jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id), v_actor_id);
    END IF;

    IF v_old_task.deleted_at IS DISTINCT FROM updated_task.deleted_at THEN
      v_has_changes := TRUE;
      v_changes := v_changes || jsonb_build_object('deleted_at', jsonb_build_object('old', v_old_task.deleted_at, 'new', updated_task.deleted_at));
      v_notification_type := CASE WHEN updated_task.deleted_at IS NOT NULL THEN 'task_deleted' ELSE 'task_restored' END;
      PERFORM public.insert_task_history(p_task_id, 'field_updated', 'deleted_at', to_jsonb(v_old_task.deleted_at), to_jsonb(updated_task.deleted_at), jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id), v_actor_id);
    END IF;
  END IF;

  IF p_replace_assignees THEN
    DELETE FROM public.task_assignees
    WHERE task_assignees.task_id = p_task_id;

    IF COALESCE(array_length(p_assignee_ids, 1), 0) > 0 THEN
      INSERT INTO public.task_assignees (task_id, user_id)
      SELECT p_task_id, assignee_id
      FROM (
        SELECT DISTINCT assignee_id
        FROM unnest(p_assignee_ids) AS assignee_id
        WHERE assignee_id IS NOT NULL
      ) deduplicated_assignees;
    END IF;

    IF v_use_explicit_actor THEN
      SELECT COALESCE(array_agg(user_id), ARRAY[]::UUID[])
      INTO v_new_assignee_ids
      FROM public.task_assignees
      WHERE task_id = p_task_id;

      FOR v_assignee_id IN
        SELECT user_id FROM unnest(v_old_assignee_ids) AS user_id
        EXCEPT
        SELECT user_id FROM unnest(v_new_assignee_ids) AS user_id
      LOOP
        SELECT id, display_name, avatar_url INTO v_assigned_user
        FROM public.users
        WHERE id = v_assignee_id;

        PERFORM public.insert_task_history(
          p_task_id,
          'assignee_removed',
          NULL,
          jsonb_build_object('user_id', v_assignee_id, 'user_name', COALESCE(v_assigned_user.display_name, 'Unknown user'), 'avatar_url', v_assigned_user.avatar_url),
          NULL,
          jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'assignee_name', COALESCE(v_assigned_user.display_name, 'Unknown user')),
          v_actor_id
        );
      END LOOP;

      FOR v_assignee_id IN
        SELECT user_id FROM unnest(v_new_assignee_ids) AS user_id
        EXCEPT
        SELECT user_id FROM unnest(v_old_assignee_ids) AS user_id
      LOOP
        SELECT id, display_name, handle, avatar_url INTO v_assigned_user
        FROM public.users
        WHERE id = v_assignee_id;

        PERFORM public.insert_task_history(
          p_task_id,
          'assignee_added',
          NULL,
          NULL,
          jsonb_build_object('user_id', v_assignee_id, 'user_name', COALESCE(v_assigned_user.display_name, v_assigned_user.handle, 'Unknown'), 'avatar_url', v_assigned_user.avatar_url),
          jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'assignee_name', COALESCE(v_assigned_user.display_name, v_assigned_user.handle, 'Unknown')),
          v_actor_id
        );

        IF v_assignee_id != v_actor_id THEN
          PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_assignee_id,
            p_type := 'task_assignee_added',
            p_title := 'Assigned to task',
            p_description := v_updater_name || ' assigned you to "' || updated_task.name || '"',
            p_data := jsonb_build_object('task_id', p_task_id, 'task_name', updated_task.name, 'board_id', v_task_details.board_id, 'assigned_by', v_actor_id, 'assigned_by_name', v_updater_name, 'action_url', '/' || v_task_details.ws_id || '/tasks/' || p_task_id),
            p_entity_type := 'task',
            p_entity_id := p_task_id,
            p_created_by := v_actor_id,
            p_scope := 'workspace'
          );
        END IF;

        FOR v_assignee_id IN
          SELECT user_id
          FROM public.task_assignees
          WHERE task_id = p_task_id
            AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND user_id != COALESCE(v_assigned_user.id, '00000000-0000-0000-0000-000000000000'::uuid)
        LOOP
          PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_assignee_id,
            p_type := 'task_assignee_added',
            p_title := 'New assignee added to task',
            p_description := v_updater_name || ' assigned ' || COALESCE(v_assigned_user.display_name, v_assigned_user.handle, 'Unknown') || ' to "' || updated_task.name || '"',
            p_data := jsonb_build_object('task_id', p_task_id, 'task_name', updated_task.name, 'assigned_user_id', v_assigned_user.id, 'assigned_user_name', COALESCE(v_assigned_user.display_name, v_assigned_user.handle, 'Unknown'), 'board_id', v_task_details.board_id, 'assigned_by', v_actor_id, 'assigned_by_name', v_updater_name, 'action_url', '/' || v_task_details.ws_id || '/tasks/' || p_task_id),
            p_entity_type := 'task',
            p_entity_id := p_task_id,
            p_created_by := v_actor_id,
            p_scope := 'workspace'
          );
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  IF p_replace_labels THEN
    DELETE FROM public.task_labels
    WHERE task_labels.task_id = p_task_id;

    IF COALESCE(array_length(p_label_ids, 1), 0) > 0 THEN
      INSERT INTO public.task_labels (task_id, label_id)
      SELECT p_task_id, label_id
      FROM (
        SELECT DISTINCT label_id
        FROM unnest(p_label_ids) AS label_id
        WHERE label_id IS NOT NULL
      ) deduplicated_labels;
    END IF;

    IF v_use_explicit_actor THEN
      SELECT COALESCE(array_agg(label_id), ARRAY[]::UUID[])
      INTO v_new_label_ids
      FROM public.task_labels
      WHERE task_id = p_task_id;

      FOR v_assignee_id IN
        SELECT label_id FROM unnest(v_old_label_ids) AS label_id
        EXCEPT
        SELECT label_id FROM unnest(v_new_label_ids) AS label_id
      LOOP
        SELECT id, name, color INTO v_label
        FROM public.workspace_task_labels
        WHERE id = v_assignee_id;

        PERFORM public.insert_task_history(
          p_task_id,
          'label_removed',
          NULL,
          jsonb_build_object('id', v_assignee_id, 'name', COALESCE(v_label.name, 'Unknown label'), 'color', v_label.color),
          NULL,
          jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'label_name', COALESCE(v_label.name, 'Unknown label'), 'label_color', v_label.color),
          v_actor_id
        );
      END LOOP;

      FOR v_assignee_id IN
        SELECT label_id FROM unnest(v_new_label_ids) AS label_id
        EXCEPT
        SELECT label_id FROM unnest(v_old_label_ids) AS label_id
      LOOP
        SELECT * INTO v_label
        FROM public.workspace_task_labels
        WHERE id = v_assignee_id;

        PERFORM public.insert_task_history(
          p_task_id,
          'label_added',
          NULL,
          NULL,
          to_jsonb(v_label),
          jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'label_name', v_label.name, 'label_color', v_label.color),
          v_actor_id
        );

        FOR v_assignee_id IN
          SELECT user_id
          FROM public.task_assignees
          WHERE task_id = p_task_id
            AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        LOOP
          PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_assignee_id,
            p_type := 'task_label_added',
            p_title := 'Label added to task',
            p_description := v_updater_name || ' added label "' || v_label.name || '" to "' || updated_task.name || '"',
            p_data := jsonb_build_object('task_id', p_task_id, 'task_name', updated_task.name, 'label_id', v_label.id, 'label_name', v_label.name, 'label_color', v_label.color, 'board_id', v_task_details.board_id, 'updated_by', v_actor_id, 'updated_by_name', v_updater_name, 'action_url', '/' || v_task_details.ws_id || '/tasks/' || p_task_id),
            p_entity_type := 'task',
            p_entity_id := p_task_id,
            p_created_by := v_actor_id,
            p_scope := 'workspace'
          );
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  IF p_replace_projects THEN
    DELETE FROM public.task_project_tasks
    WHERE task_project_tasks.task_id = p_task_id;

    IF COALESCE(array_length(p_project_ids, 1), 0) > 0 THEN
      INSERT INTO public.task_project_tasks (task_id, project_id)
      SELECT p_task_id, project_id
      FROM (
        SELECT DISTINCT project_id
        FROM unnest(p_project_ids) AS project_id
        WHERE project_id IS NOT NULL
      ) deduplicated_projects;
    END IF;

    IF v_use_explicit_actor THEN
      SELECT COALESCE(array_agg(project_id), ARRAY[]::UUID[])
      INTO v_new_project_ids
      FROM public.task_project_tasks
      WHERE task_id = p_task_id;

      FOR v_assignee_id IN
        SELECT project_id FROM unnest(v_old_project_ids) AS project_id
        EXCEPT
        SELECT project_id FROM unnest(v_new_project_ids) AS project_id
      LOOP
        SELECT id, name INTO v_project
        FROM public.task_projects
        WHERE id = v_assignee_id;

        PERFORM public.insert_task_history(
          p_task_id,
          'project_unlinked',
          NULL,
          jsonb_build_object('project_id', v_assignee_id, 'project_name', COALESCE(v_project.name, 'Unknown project')),
          NULL,
          jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'project_name', COALESCE(v_project.name, 'Unknown project')),
          v_actor_id
        );
      END LOOP;

      FOR v_assignee_id IN
        SELECT project_id FROM unnest(v_new_project_ids) AS project_id
        EXCEPT
        SELECT project_id FROM unnest(v_old_project_ids) AS project_id
      LOOP
        SELECT id, name INTO v_project
        FROM public.task_projects
        WHERE id = v_assignee_id;

        PERFORM public.insert_task_history(
          p_task_id,
          'project_linked',
          NULL,
          NULL,
          jsonb_build_object('project_id', v_assignee_id, 'project_name', COALESCE(v_project.name, 'Unknown project')),
          jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'project_name', COALESCE(v_project.name, 'Unknown project')),
          v_actor_id
        );

        FOR v_assignee_id IN
          SELECT user_id
          FROM public.task_assignees
          WHERE task_id = p_task_id
            AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        LOOP
          PERFORM public.create_notification(
            p_ws_id := v_task_details.ws_id,
            p_user_id := v_assignee_id,
            p_type := 'task_project_linked',
            p_title := 'Project linked to task',
            p_description := v_updater_name || ' linked project "' || COALESCE(v_project.name, 'Unknown project') || '" to "' || updated_task.name || '"',
            p_data := jsonb_build_object('task_id', p_task_id, 'task_name', updated_task.name, 'project_id', v_project.id, 'project_name', COALESCE(v_project.name, 'Unknown project'), 'board_id', v_task_details.board_id, 'updated_by', v_actor_id, 'updated_by_name', v_updater_name),
            p_entity_type := 'task',
            p_entity_id := p_task_id,
            p_created_by := v_actor_id
          );
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  IF v_use_explicit_actor AND v_has_changes THEN
    v_notification_data := jsonb_build_object('task_id', p_task_id, 'task_name', updated_task.name, 'changes', v_changes, 'change_type', v_notification_type, 'board_id', v_task_details.board_id, 'updated_by', v_actor_id, 'updated_by_name', v_updater_name);

    IF v_notification_type = 'task_moved' THEN
      v_notification_data := v_notification_data || jsonb_build_object('old_list_name', COALESCE(v_old_list_name, 'Unknown'), 'new_list_name', COALESCE(v_new_list_name, 'Unknown'));
    END IF;

    FOR v_assignee_id IN
      SELECT user_id
      FROM public.task_assignees
      WHERE task_id = p_task_id
        AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      PERFORM public.create_notification(
        p_ws_id := v_task_details.ws_id,
        p_user_id := v_assignee_id,
        p_email := NULL,
        p_type := v_notification_type,
        p_code := NULL,
        p_title := 'Task updated',
        p_description := v_updater_name || ' updated "' || updated_task.name || '"',
        p_data := v_notification_data,
        p_entity_type := 'task',
        p_entity_id := p_task_id,
        p_created_by := v_actor_id,
        p_scope := 'workspace',
        p_priority := 'medium'
      );
    END LOOP;
  END IF;

  RETURN NEXT updated_task;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_with_relations(UUID, JSONB, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID) TO authenticated;

COMMENT ON FUNCTION public.update_task_with_relations(UUID, JSONB, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID[], BOOLEAN, UUID) IS
'Updates a task, optionally replaces task relations, and propagates an explicit actor into task-history triggers during service-role writes.';

CREATE OR REPLACE FUNCTION public.update_task_fields_with_actor(
  p_task_id UUID,
  p_task_updates JSONB,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.update_task_with_relations(
    p_task_id := p_task_id,
    p_task_updates := p_task_updates,
    p_assignee_ids := NULL,
    p_replace_assignees := FALSE,
    p_label_ids := NULL,
    p_replace_labels := FALSE,
    p_project_ids := NULL,
    p_replace_projects := FALSE,
    p_actor_user_id := p_actor_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_fields_with_actor(UUID, JSONB, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_task_label_with_actor(
  p_task_id UUID,
  p_label_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.task_labels
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_inserted public.task_labels%rowtype;
  v_task_details RECORD;
  v_label RECORD;
  v_assignee_id UUID;
  v_updater_name TEXT;
  v_task_name TEXT;
BEGIN
  v_actor_id := COALESCE(p_actor_user_id, auth.uid());

  INSERT INTO public.task_labels (task_id, label_id)
  VALUES (p_task_id, p_label_id)
  RETURNING * INTO v_inserted;

  IF p_actor_user_id IS NOT NULL AND auth.uid() IS NULL THEN
    SELECT * INTO v_task_details FROM public.get_task_details(p_task_id);
    SELECT * INTO v_label FROM public.workspace_task_labels WHERE id = p_label_id;
    SELECT name INTO v_task_name FROM public.tasks WHERE id = p_task_id;
    v_updater_name := public.get_task_actor_display_name(v_actor_id);

    PERFORM public.insert_task_history(
      p_task_id,
      'label_added',
      NULL,
      NULL,
      to_jsonb(v_label),
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'label_name', v_label.name, 'label_color', v_label.color),
      v_actor_id
    );

    FOR v_assignee_id IN
      SELECT user_id
      FROM public.task_assignees
      WHERE task_id = p_task_id
        AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      PERFORM public.create_notification(
        p_ws_id := v_task_details.ws_id,
        p_user_id := v_assignee_id,
        p_type := 'task_label_added',
        p_title := 'Label added to task',
        p_description := v_updater_name || ' added label "' || v_label.name || '" to "' || COALESCE(v_task_name, 'Task') || '"',
        p_data := jsonb_build_object('task_id', p_task_id, 'task_name', COALESCE(v_task_name, 'Task'), 'label_id', v_label.id, 'label_name', v_label.name, 'label_color', v_label.color, 'board_id', v_task_details.board_id, 'updated_by', v_actor_id, 'updated_by_name', v_updater_name, 'action_url', '/' || v_task_details.ws_id || '/tasks/' || p_task_id),
        p_entity_type := 'task',
        p_entity_id := p_task_id,
        p_created_by := v_actor_id,
        p_scope := 'workspace'
      );
    END LOOP;
  END IF;

  RETURN NEXT v_inserted;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_task_label_with_actor(UUID, UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_task_label_with_actor(
  p_task_id UUID,
  p_label_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.task_labels
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_deleted public.task_labels%rowtype;
  v_task_details RECORD;
  v_label RECORD;
BEGIN
  v_actor_id := COALESCE(p_actor_user_id, auth.uid());

  DELETE FROM public.task_labels
  WHERE task_id = p_task_id
    AND label_id = p_label_id
  RETURNING * INTO v_deleted;

  IF v_deleted IS NOT NULL AND p_actor_user_id IS NOT NULL AND auth.uid() IS NULL THEN
    SELECT * INTO v_task_details FROM public.get_task_details(p_task_id);
    SELECT id, name, color INTO v_label FROM public.workspace_task_labels WHERE id = p_label_id;

    PERFORM public.insert_task_history(
      p_task_id,
      'label_removed',
      NULL,
      jsonb_build_object('id', p_label_id, 'name', COALESCE(v_label.name, 'Unknown label'), 'color', v_label.color),
      NULL,
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'label_name', COALESCE(v_label.name, 'Unknown label'), 'label_color', v_label.color),
      v_actor_id
    );
  END IF;

  IF v_deleted IS NOT NULL THEN
    RETURN NEXT v_deleted;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_task_label_with_actor(UUID, UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_task_project_with_actor(
  p_task_id UUID,
  p_project_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.task_project_tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_inserted public.task_project_tasks%rowtype;
  v_task_details RECORD;
  v_project RECORD;
  v_assignee_id UUID;
  v_updater_name TEXT;
  v_task_name TEXT;
BEGIN
  v_actor_id := COALESCE(p_actor_user_id, auth.uid());

  INSERT INTO public.task_project_tasks (task_id, project_id)
  VALUES (p_task_id, p_project_id)
  RETURNING * INTO v_inserted;

  IF p_actor_user_id IS NOT NULL AND auth.uid() IS NULL THEN
    SELECT * INTO v_task_details FROM public.get_task_details(p_task_id);
    SELECT id, name INTO v_project FROM public.task_projects WHERE id = p_project_id;
    SELECT name INTO v_task_name FROM public.tasks WHERE id = p_task_id;
    v_updater_name := public.get_task_actor_display_name(v_actor_id);

    PERFORM public.insert_task_history(
      p_task_id,
      'project_linked',
      NULL,
      NULL,
      jsonb_build_object('project_id', p_project_id, 'project_name', COALESCE(v_project.name, 'Unknown project')),
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'project_name', COALESCE(v_project.name, 'Unknown project')),
      v_actor_id
    );

    FOR v_assignee_id IN
      SELECT user_id
      FROM public.task_assignees
      WHERE task_id = p_task_id
        AND user_id != COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      PERFORM public.create_notification(
        p_ws_id := v_task_details.ws_id,
        p_user_id := v_assignee_id,
        p_type := 'task_project_linked',
        p_title := 'Project linked to task',
        p_description := v_updater_name || ' linked project "' || COALESCE(v_project.name, 'Unknown project') || '" to "' || COALESCE(v_task_name, 'Task') || '"',
        p_data := jsonb_build_object('task_id', p_task_id, 'task_name', COALESCE(v_task_name, 'Task'), 'project_id', p_project_id, 'project_name', COALESCE(v_project.name, 'Unknown project'), 'board_id', v_task_details.board_id, 'updated_by', v_actor_id, 'updated_by_name', v_updater_name),
        p_entity_type := 'task',
        p_entity_id := p_task_id,
        p_created_by := v_actor_id
      );
    END LOOP;
  END IF;

  RETURN NEXT v_inserted;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_task_project_with_actor(UUID, UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlink_task_project_with_actor(
  p_task_id UUID,
  p_project_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.task_project_tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_deleted public.task_project_tasks%rowtype;
  v_task_details RECORD;
  v_project RECORD;
BEGIN
  v_actor_id := COALESCE(p_actor_user_id, auth.uid());

  DELETE FROM public.task_project_tasks
  WHERE task_id = p_task_id
    AND project_id = p_project_id
  RETURNING * INTO v_deleted;

  IF v_deleted IS NOT NULL AND p_actor_user_id IS NOT NULL AND auth.uid() IS NULL THEN
    SELECT * INTO v_task_details FROM public.get_task_details(p_task_id);
    SELECT id, name INTO v_project FROM public.task_projects WHERE id = p_project_id;

    PERFORM public.insert_task_history(
      p_task_id,
      'project_unlinked',
      NULL,
      jsonb_build_object('project_id', p_project_id, 'project_name', COALESCE(v_project.name, 'Unknown project')),
      NULL,
      jsonb_build_object('ws_id', v_task_details.ws_id, 'board_id', v_task_details.board_id, 'project_name', COALESCE(v_project.name, 'Unknown project')),
      v_actor_id
    );
  END IF;

  IF v_deleted IS NOT NULL THEN
    RETURN NEXT v_deleted;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_task_project_with_actor(UUID, UUID, UUID) TO authenticated;
