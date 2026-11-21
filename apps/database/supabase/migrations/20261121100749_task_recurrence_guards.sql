-- The guards and their helpers run only through database-owned code.
-- tuturuuu: no-grant (internal)
SET LOCAL lock_timeout = '3s';

CREATE FUNCTION private.task_recurrence_is_open(
  p_deleted_at timestamptz, p_completed_at timestamptz, p_closed_at timestamptz, p_status public.task_board_status
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_deleted_at IS NULL AND p_completed_at IS NULL AND p_closed_at IS NULL
    AND coalesce(p_status NOT IN ('done', 'closed'), true);
$$;

-- Reclassify a statement's linked tasks together so only final occupancy consumes
-- capacity. The task and list triggers stabilize the list rows before calling.
CREATE FUNCTION private.task_recurrence_reclassify(p_tasks uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  link record;
  available_slot smallint;
BEGIN
  PERFORM 1 FROM private.task_recurrence_series AS series
  WHERE series.id IN (
    SELECT occurrence.series_id FROM private.task_recurrence_occurrences AS occurrence
    WHERE occurrence.task_id = ANY(p_tasks)
  )
  ORDER BY series.id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM private.task_recurrence_occurrences AS occurrence
    JOIN public.tasks AS task ON task.id = occurrence.task_id
    LEFT JOIN public.task_lists AS list ON list.id = task.list_id
    LEFT JOIN public.workspace_boards AS board ON board.id = list.board_id
    WHERE occurrence.task_id = ANY(p_tasks) AND board.ws_id IS DISTINCT FROM occurrence.ws_id
  ) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_CROSS_WORKSPACE_MOVE';
  END IF;
  DELETE FROM private.task_recurrence_transitions WHERE task_id = ANY(p_tasks);

  UPDATE private.task_recurrence_occurrences AS occurrence
  SET task_list_id = task.list_id,
      open_slot = CASE WHEN private.task_recurrence_is_open(
        task.deleted_at, task.completed_at, task.closed_at, list.status
      ) THEN occurrence.open_slot END
  FROM public.tasks AS task JOIN public.task_lists AS list ON list.id = task.list_id
  WHERE task.id = occurrence.task_id AND occurrence.task_id = ANY(p_tasks);

  FOR link IN
    SELECT occurrence.series_id, occurrence.occurrence_date, occurrence.task_id
    FROM private.task_recurrence_occurrences AS occurrence
    JOIN public.tasks AS task ON task.id = occurrence.task_id
    JOIN public.task_lists AS list ON list.id = task.list_id
    WHERE occurrence.task_id = ANY(p_tasks) AND occurrence.open_slot IS NULL
      AND private.task_recurrence_is_open(task.deleted_at, task.completed_at, task.closed_at, list.status)
    ORDER BY occurrence.series_id, occurrence.occurrence_date
  LOOP
    SELECT slot INTO available_slot FROM generate_series(1, 3) AS slot
    WHERE NOT EXISTS (
      SELECT 1 FROM private.task_recurrence_occurrences
      WHERE series_id = link.series_id AND open_slot = slot
    ) ORDER BY slot LIMIT 1;
    IF NOT FOUND THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_OPEN_CAPACITY';
    END IF;
    UPDATE private.task_recurrence_occurrences SET open_slot = available_slot
    WHERE series_id = link.series_id AND occurrence_date = link.occurrence_date;
  END LOOP;
END;
$$;

CREATE FUNCTION private.task_recurrence_guard_task()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  affected_tasks uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM 1
    FROM private.task_recurrence_series AS series
    JOIN private.task_recurrence_occurrences AS occurrence ON occurrence.series_id = series.id
    WHERE occurrence.task_id = OLD.id FOR UPDATE OF series;
    IF FOUND THEN
      UPDATE private.task_recurrence_occurrences
      SET task_id = NULL, task_list_id = NULL, task_write_version = NULL, open_slot = NULL
      WHERE task_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  SELECT array_agg(new_task.id) INTO affected_tasks
  FROM new_tasks AS new_task
  JOIN old_tasks AS old_task USING (id)
  JOIN private.task_recurrence_occurrences AS occurrence ON occurrence.task_id = new_task.id
  WHERE (new_task.list_id, new_task.deleted_at, new_task.completed_at, new_task.closed_at, new_task.updated_at)
    IS DISTINCT FROM (old_task.list_id, old_task.deleted_at, old_task.completed_at, old_task.closed_at, old_task.updated_at);
  IF affected_tasks IS NOT NULL THEN
    PERFORM 1 FROM public.task_lists
    WHERE id IN (SELECT list_id FROM new_tasks WHERE id = ANY(affected_tasks))
    ORDER BY id FOR SHARE;
    PERFORM private.task_recurrence_reclassify(affected_tasks);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER task_recurrence_guard_task_update
AFTER UPDATE ON public.tasks
REFERENCING OLD TABLE AS old_tasks NEW TABLE AS new_tasks
FOR EACH STATEMENT EXECUTE FUNCTION private.task_recurrence_guard_task();

CREATE TRIGGER task_recurrence_guard_task_delete
BEFORE DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.task_recurrence_guard_task();

CREATE FUNCTION private.task_recurrence_guard_list()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  affected_tasks uuid[];
BEGIN
  IF EXISTS (
    SELECT 1 FROM old_lists AS old_list JOIN new_lists AS new_list USING (id)
    WHERE old_list.board_id IS DISTINCT FROM new_list.board_id
      AND (EXISTS (SELECT 1 FROM private.task_recurrence_series WHERE list_id = old_list.id)
        OR EXISTS (SELECT 1 FROM private.task_recurrence_occurrences
          WHERE task_list_id = old_list.id AND task_id IS NOT NULL))
  ) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_LIST_TOPOLOGY';
  END IF;

  SELECT array_agg(changed.task_id) INTO affected_tasks
  FROM (
    SELECT occurrence.task_id
    FROM old_lists AS old_list JOIN new_lists AS new_list USING (id)
    JOIN private.task_recurrence_occurrences AS occurrence ON occurrence.task_list_id = new_list.id
    JOIN public.tasks AS task ON task.id = occurrence.task_id
    WHERE coalesce(old_list.status IN ('done', 'closed'), false)
      IS DISTINCT FROM coalesce(new_list.status IN ('done', 'closed'), false)
      AND task.deleted_at IS NULL AND task.completed_at IS NULL AND task.closed_at IS NULL
    LIMIT 501
  ) AS changed;
  IF cardinality(affected_tasks) > 500 THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_LIST_RECLASSIFICATION_LIMIT';
  END IF;
  IF affected_tasks IS NOT NULL THEN
    PERFORM private.task_recurrence_reclassify(affected_tasks);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER task_recurrence_guard_list_update
AFTER UPDATE ON public.task_lists
REFERENCING OLD TABLE AS old_lists NEW TABLE AS new_lists
FOR EACH STATEMENT EXECUTE FUNCTION private.task_recurrence_guard_list();

CREATE FUNCTION private.task_recurrence_guard_board()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM private.task_recurrence_series WHERE board_id = OLD.id)
    OR EXISTS (
      SELECT 1 FROM public.task_lists AS list
      JOIN private.task_recurrence_occurrences AS occurrence ON occurrence.task_list_id = list.id
      WHERE list.board_id = OLD.id AND occurrence.task_id IS NOT NULL
    ) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_BOARD_TOPOLOGY';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_recurrence_guard_board_workspace
BEFORE UPDATE OF ws_id ON public.workspace_boards
FOR EACH ROW WHEN (OLD.ws_id IS DISTINCT FROM NEW.ws_id)
EXECUTE FUNCTION private.task_recurrence_guard_board();

-- New links must agree with the persisted task and tenant at commit. The
-- deferred check sees the final classification after multi-row statements.
CREATE FUNCTION private.task_recurrence_check_occurrence()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  occurrence private.task_recurrence_occurrences%ROWTYPE;
BEGIN
  SELECT * INTO occurrence FROM private.task_recurrence_occurrences
  WHERE series_id = NEW.series_id AND occurrence_date = NEW.occurrence_date;
  IF occurrence.task_id IS NULL THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.tasks AS task
  JOIN public.task_lists AS list ON list.id = task.list_id
  JOIN public.workspace_boards AS board ON board.id = list.board_id
  WHERE task.id = occurrence.task_id FOR SHARE OF task, list, board;
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks AS task
    JOIN public.task_lists AS list ON list.id = task.list_id
    JOIN public.workspace_boards AS board ON board.id = list.board_id
    WHERE task.id = occurrence.task_id AND list.id = occurrence.task_list_id
      AND board.ws_id = occurrence.ws_id
      AND (occurrence.open_slot IS NOT NULL) = private.task_recurrence_is_open(
        task.deleted_at, task.completed_at, task.closed_at, list.status
      )
  ) THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_OCCURRENCE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER task_recurrence_occurrence_classification
AFTER INSERT OR UPDATE OF task_id, task_list_id, open_slot, ws_id, series_id, occurrence_date
ON private.task_recurrence_occurrences
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.task_recurrence_check_occurrence();

CREATE FUNCTION private.task_recurrence_check_active_slot()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  series private.task_recurrence_series%ROWTYPE;
  slot private.task_recurrence_active_slots%ROWTYPE;
  series_ids uuid[];
  checked_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'task_recurrence_series' THEN
    series_ids := ARRAY[OLD.id, NEW.id];
  ELSE
    series_ids := ARRAY[OLD.series_id, NEW.series_id];
  END IF;
  FOR checked_id IN SELECT DISTINCT id FROM unnest(series_ids) AS id WHERE id IS NOT NULL LOOP
    SELECT * INTO series FROM private.task_recurrence_series WHERE id = checked_id;
    SELECT * INTO slot FROM private.task_recurrence_active_slots WHERE series_id = checked_id;
    IF series.id IS NOT NULL THEN
      PERFORM 1 FROM public.workspace_boards
      WHERE id = series.board_id AND ws_id = series.ws_id FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TASK_RECURRENCE_SERIES_TOPOLOGY' USING ERRCODE = '23514';
      END IF;
      IF series.list_id IS NOT NULL THEN
        PERFORM 1 FROM public.task_lists
        WHERE id = series.list_id AND board_id = series.board_id FOR SHARE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'TASK_RECURRENCE_SERIES_TOPOLOGY' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
    IF (series.state IS NOT DISTINCT FROM 'active') IS DISTINCT FROM (slot.series_id IS NOT NULL)
      OR (slot.series_id IS NOT NULL AND (slot.ws_id, slot.owner_id) IS DISTINCT FROM (series.ws_id, series.owner_id)) THEN
      RAISE EXCEPTION 'TASK_RECURRENCE_ACTIVE_SLOT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF slot.series_id IS NOT NULL THEN
      PERFORM 1 FROM public.workspace_members AS member
      WHERE member.ws_id = series.ws_id AND member.user_id = series.owner_id AND member.type = 'MEMBER'
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TASK_RECURRENCE_ACTIVE_SLOT_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER task_recurrence_series_active_slot
AFTER INSERT OR UPDATE OR DELETE ON private.task_recurrence_series
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.task_recurrence_check_active_slot();

CREATE CONSTRAINT TRIGGER task_recurrence_slot_active_series
AFTER INSERT OR UPDATE OR DELETE ON private.task_recurrence_active_slots
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.task_recurrence_check_active_slot();

CREATE FUNCTION private.task_recurrence_release_erased_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
BEGIN
  IF OLD.state = 'active' THEN
    NEW.state := 'paused';
    NEW.state_reason := 'owner_ineligible';
    NEW.revision := OLD.revision + 1;
    DELETE FROM private.task_recurrence_active_slots WHERE series_id = OLD.id;
    DELETE FROM private.task_recurrence_transitions WHERE series_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_recurrence_erase_owner
BEFORE UPDATE OF owner_id ON private.task_recurrence_series
FOR EACH ROW WHEN (OLD.owner_id IS NOT NULL AND NEW.owner_id IS NULL)
EXECUTE FUNCTION private.task_recurrence_release_erased_owner();

CREATE FUNCTION private.task_recurrence_release_departed_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  affected_series uuid[];
BEGIN
  SELECT array_agg(id) INTO affected_series FROM (
    SELECT id FROM private.task_recurrence_series
    WHERE ws_id = OLD.ws_id AND owner_id = OLD.user_id AND state = 'active'
    ORDER BY id FOR UPDATE
  ) AS active_series;
  IF affected_series IS NOT NULL THEN
    UPDATE private.task_recurrence_series
    SET state = 'paused', state_reason = 'owner_ineligible', revision = revision + 1
    WHERE id = ANY(affected_series);
    DELETE FROM private.task_recurrence_active_slots WHERE series_id = ANY(affected_series);
    DELETE FROM private.task_recurrence_transitions WHERE series_id = ANY(affected_series);
  END IF;
  DELETE FROM private.task_recurrence_transitions WHERE ws_id = OLD.ws_id AND actor_id = OLD.user_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER task_recurrence_member_delete
AFTER DELETE ON public.workspace_members
FOR EACH ROW WHEN (OLD.type = 'MEMBER')
EXECUTE FUNCTION private.task_recurrence_release_departed_member();

CREATE TRIGGER task_recurrence_member_change
AFTER UPDATE OF ws_id, user_id, type ON public.workspace_members
FOR EACH ROW WHEN (OLD.type = 'MEMBER' AND (OLD.ws_id, OLD.user_id, OLD.type)
  IS DISTINCT FROM (NEW.ws_id, NEW.user_id, NEW.type))
EXECUTE FUNCTION private.task_recurrence_release_departed_member();

-- Existing members' permissions are the live authorization source. Matching
-- row locks fence revocations during proof capture, including workspace ownership.
CREATE FUNCTION private.task_recurrence_lock_member_edit(p_ws uuid, p_actor uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
BEGIN
  PERFORM 1 FROM public.workspace_members
  WHERE ws_id = p_ws AND user_id = p_actor AND type = 'MEMBER' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.workspaces WHERE id = p_ws FOR SHARE;
  PERFORM 1 FROM public.workspace_role_members AS member
  JOIN public.workspace_role_permissions AS permission ON permission.role_id = member.role_id
  WHERE member.user_id = p_actor AND permission.ws_id = p_ws
    AND permission.permission IN ('admin', 'manage_projects') AND permission.enabled
  ORDER BY member.role_id, permission.permission FOR SHARE OF member, permission;
  PERFORM 1 FROM public.workspace_default_permissions
  WHERE ws_id = p_ws AND member_type = 'MEMBER' AND permission IN ('admin', 'manage_projects') AND enabled
  ORDER BY permission FOR SHARE;
  RETURN public.has_workspace_permission(p_ws, p_actor, 'manage_projects') IS TRUE;
END;
$$;

-- The trusted server uses this narrow completion path only after resolving
-- member-mode edit. Public task mutations cannot insert or return a proof.
CREATE FUNCTION private.task_recurrence_capture_completion(
  p_ws uuid, p_actor uuid, p_task uuid, p_list uuid, p_sort_key bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
DECLARE
  jwt_actor uuid := auth.uid();
  actor uuid := coalesce(jwt_actor, p_actor);
  control private.task_recurrence_control%ROWTYPE;
  gate private.task_recurrence_workspace%ROWTYPE;
  series private.task_recurrence_series%ROWTYPE;
  occurrence private.task_recurrence_occurrences%ROWTYPE;
  task_before public.tasks%ROWTYPE;
  task_after public.tasks%ROWTYPE;
  source_list public.task_lists%ROWTYPE;
  target_list public.task_lists%ROWTYPE;
  proof uuid;
BEGIN
  IF actor IS NULL OR p_actor IS DISTINCT FROM actor OR p_task IS NULL OR p_list IS NULL OR p_ws IS NULL THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_ACTOR_OR_SCOPE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO STRICT control FROM private.task_recurrence_control WHERE singleton FOR SHARE;
  SELECT * INTO gate FROM private.task_recurrence_workspace WHERE ws_id = p_ws FOR UPDATE;
  IF NOT control.request_enabled OR gate.enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  SELECT * INTO occurrence FROM private.task_recurrence_occurrences WHERE task_id = p_task AND ws_id = p_ws;
  SELECT * INTO series FROM private.task_recurrence_series
  WHERE id = occurrence.series_id AND ws_id = p_ws FOR UPDATE;
  IF NOT FOUND OR NOT private.task_recurrence_lock_member_edit(p_ws, actor) THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_TASK_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.workspace_boards
  WHERE id = series.board_id AND ws_id = p_ws AND deleted_at IS NULL AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_TASK_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.task_lists WHERE id IN (occurrence.task_list_id, p_list) ORDER BY id FOR SHARE;
  SELECT * INTO source_list FROM public.task_lists WHERE id = occurrence.task_list_id AND board_id = series.board_id;
  SELECT * INTO target_list FROM public.task_lists WHERE id = p_list AND board_id = series.board_id;
  SELECT * INTO task_before FROM public.tasks WHERE id = p_task FOR UPDATE;
  IF task_before.id IS NULL OR task_before.deleted_at IS NOT NULL
    OR task_before.list_id IS DISTINCT FROM source_list.id
    OR source_list.deleted IS TRUE OR source_list.archived IS TRUE
    OR target_list.id IS NULL OR target_list.deleted IS TRUE OR target_list.archived IS TRUE
    OR (p_list IS DISTINCT FROM source_list.id AND coalesce(target_list.status NOT IN ('done', 'closed'), true))
    OR NOT EXISTS (SELECT 1 FROM private.task_recurrence_occurrences
      WHERE series_id = series.id AND task_id = p_task AND task_list_id = source_list.id) THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_TASK_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF NOT private.task_recurrence_is_open(task_before.deleted_at, task_before.completed_at,
      task_before.closed_at, source_list.status) THEN
    RETURN jsonb_build_object('status', 'unchanged');
  END IF;

  IF p_list = source_list.id THEN
    UPDATE public.tasks SET completed = true, completed_at = clock_timestamp(), closed_at = clock_timestamp()
    WHERE id = p_task RETURNING * INTO task_after;
  ELSE
    UPDATE public.tasks SET list_id = p_list, sort_key = coalesce(p_sort_key, sort_key)
    WHERE id = p_task RETURNING * INTO task_after;
  END IF;

  IF private.task_recurrence_is_open(task_after.deleted_at, task_after.completed_at,
      task_after.closed_at, target_list.status) OR task_after.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_COMPLETION_TRANSITION_MISSING' USING ERRCODE = '23514';
  END IF;
  IF jwt_actor IS NULL AND task_before.list_id IS DISTINCT FROM task_after.list_id THEN
    PERFORM public.insert_task_history(p_task, 'field_updated', 'list_id',
      to_jsonb(task_before.list_id), to_jsonb(task_after.list_id),
      jsonb_build_object('ws_id', p_ws, 'board_id', series.board_id,
        'old_list_name', source_list.name, 'new_list_name', target_list.name), actor);
  END IF;
  IF jwt_actor IS NULL AND task_before.completed IS DISTINCT FROM task_after.completed THEN
    PERFORM public.insert_task_history(p_task, 'field_updated', 'completed',
      to_jsonb(task_before.completed), to_jsonb(task_after.completed),
      jsonb_build_object('ws_id', p_ws, 'board_id', series.board_id), actor);
  END IF;

  IF series.state = 'active' AND private.task_recurrence_lock_member_edit(p_ws, series.owner_id)
    AND occurrence.occurrence_date = (
    SELECT occurrence_date FROM private.task_recurrence_occurrences
    WHERE series_id = series.id AND state = 'created'
    ORDER BY occurrence_date DESC LIMIT 1
  ) THEN
    INSERT INTO private.task_recurrence_transitions (
      task_id, series_id, ws_id, actor_id, cursor_date, revision, progress, global_epoch, workspace_epoch, expires_at
    ) VALUES (
      p_task, series.id, p_ws, actor, series.cursor_date, series.revision, series.progress,
      control.epoch, gate.epoch, clock_timestamp() + interval '180 seconds'
    ) RETURNING transition_id INTO proof;
  END IF;

  RETURN jsonb_build_object('status', 'completed', 'task_id', p_task, 'transition_id', proof);
END;
$$;

REVOKE ALL ON FUNCTION
  private.task_recurrence_is_open(timestamptz, timestamptz, timestamptz, public.task_board_status),
  private.task_recurrence_reclassify(uuid[]),
  private.task_recurrence_guard_task(),
  private.task_recurrence_guard_list(),
  private.task_recurrence_guard_board(),
  private.task_recurrence_check_occurrence(),
  private.task_recurrence_check_active_slot(),
  private.task_recurrence_release_erased_owner(),
  private.task_recurrence_release_departed_member(),
  private.task_recurrence_lock_member_edit(uuid, uuid),
  private.task_recurrence_capture_completion(uuid, uuid, uuid, uuid, bigint)
FROM PUBLIC, anon, authenticated, service_role, task_recurrence_operator;
GRANT EXECUTE ON FUNCTION private.task_recurrence_capture_completion(uuid, uuid, uuid, uuid, bigint) TO service_role;
