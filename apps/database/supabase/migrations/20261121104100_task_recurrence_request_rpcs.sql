SET LOCAL lock_timeout = '3s';

ALTER TABLE private.task_recurrence_receipts
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX task_recurrence_receipt_create_rate_idx
ON private.task_recurrence_receipts (actor_id, created_at) WHERE operation = 'create';

CREATE FUNCTION private.task_recurrence_prepare_create(p_ws uuid, p_actor uuid, p_list uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM private.task_recurrence_request_actor(p_actor);
  SELECT jsonb_build_object('board_id', board.id, 'global_epoch', control.epoch, 'workspace_epoch', workspace.epoch)
  INTO result
  FROM public.task_lists AS list
  JOIN public.workspace_boards AS board ON board.id = list.board_id
  JOIN public.workspace_members AS member ON member.ws_id = board.ws_id AND member.user_id = p_actor AND member.type = 'MEMBER'
  JOIN private.task_recurrence_workspace AS workspace ON workspace.ws_id = board.ws_id AND workspace.enabled
  CROSS JOIN private.task_recurrence_control AS control
  WHERE list.id = p_list AND board.ws_id = p_ws AND control.request_enabled
    AND list.archived IS DISTINCT FROM true AND list.deleted IS DISTINCT FROM true
    AND list.status NOT IN ('done','closed') AND board.deleted_at IS NULL AND board.archived_at IS NULL
    AND public.has_workspace_permission(p_ws, p_actor, 'manage_projects');
  IF result IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE'; END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION private.task_recurrence_create(
  p_ws uuid, p_actor uuid, p_list uuid, p_request uuid, p_expires_at timestamptz,
  p_global_epoch bigint, p_ws_epoch bigint, p_spec jsonb, p_plan jsonb
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
  SELECT private.task_recurrence_apply_request(
    'create', p_ws, p_actor, p_list, NULL, NULL, p_request, p_expires_at,
    p_global_epoch, p_ws_epoch, NULL, NULL, p_spec, p_plan, NULL, NULL
  );
$$;

CREATE FUNCTION private.task_recurrence_edit(
  p_ws uuid, p_actor uuid, p_series uuid, p_task uuid, p_request uuid, p_expires_at timestamptz,
  p_revision bigint, p_progress bigint, p_spec jsonb, p_plan jsonb
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
  SELECT private.task_recurrence_apply_request(
    'edit', p_ws, p_actor, NULL, p_series, p_task, p_request, p_expires_at,
    NULL, NULL, p_revision, p_progress, p_spec, p_plan, NULL, NULL
  );
$$;

CREATE FUNCTION private.task_recurrence_set_status(
  p_ws uuid, p_actor uuid, p_series uuid, p_task uuid, p_request uuid, p_expires_at timestamptz,
  p_revision bigint, p_progress bigint, p_action text, p_delete_task uuid, p_plan jsonb
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
  SELECT private.task_recurrence_apply_request(
    'status', p_ws, p_actor, NULL, p_series, p_task, p_request, p_expires_at,
    NULL, NULL, p_revision, p_progress, NULL, p_plan, p_action, nullif(p_delete_task, '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

CREATE FUNCTION private.task_recurrence_read(p_ws uuid, p_actor uuid, p_tasks uuid[], p_include_template boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM private.task_recurrence_request_actor(p_actor);
  IF p_tasks IS NULL OR cardinality(p_tasks) > 100 OR array_position(p_tasks, NULL) IS NOT NULL
    OR p_include_template IS NULL THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_READ_LIMIT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members WHERE ws_id = p_ws AND user_id = p_actor AND type = 'MEMBER'
  ) OR (p_include_template AND NOT public.has_workspace_permission(p_ws, p_actor, 'manage_projects')) THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.task_recurrence_control AS control CROSS JOIN private.task_recurrence_workspace AS workspace
    WHERE control.request_enabled AND workspace.enabled AND workspace.ws_id = p_ws
  ) THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('task_id', occurrence.task_id, 'series_id', series.id,
      'occurrence_date', occurrence.occurrence_date, 'state', series.state, 'revision', series.revision,
      'progress', series.progress)
    || CASE WHEN p_include_template THEN jsonb_build_object(
      'rule', series.rule, 'template', series.template, 'anchor_date', series.anchor_date,
      'due_time', series.due_time, 'start_offset_days', series.start_offset_days)
      ELSE '{}'::jsonb END
    ORDER BY occurrence.task_id
  ), '[]'::jsonb) INTO result
  FROM private.task_recurrence_occurrences AS occurrence
  JOIN private.task_recurrence_series AS series ON series.id = occurrence.series_id AND series.ws_id = p_ws
  JOIN public.tasks AS task ON task.id = occurrence.task_id
  JOIN public.task_lists AS list ON list.id = task.list_id
  JOIN public.workspace_boards AS board ON board.id = list.board_id AND board.id = series.board_id
  WHERE occurrence.task_id = ANY(p_tasks) AND task.deleted_at IS NULL
    AND list.deleted IS DISTINCT FROM true AND board.deleted_at IS NULL AND series.state <> 'deleted';
  IF octet_length(result::text) > 65536 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_READ_LIMIT';
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION private.task_recurrence_prepare_completion(p_ws uuid, p_actor uuid, p_task uuid, p_request uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM private.task_recurrence_request_actor(p_actor);
  SELECT jsonb_build_object('transition_id', proof.transition_id, 'rule', series.rule,
    'anchor_date', series.anchor_date, 'due_time', series.due_time, 'start_offset_days', series.start_offset_days,
    'cursor_date', series.cursor_date, 'consumed_count', series.consumed_count,
    'description', series.template->'description')
  INTO result
  FROM private.task_recurrence_transitions AS proof
  JOIN private.task_recurrence_series AS series ON series.id = proof.series_id AND series.ws_id = proof.ws_id
  JOIN private.task_recurrence_workspace AS workspace ON workspace.ws_id = p_ws AND workspace.enabled
  JOIN private.task_recurrence_receipts AS receipt
    ON receipt.ws_id = p_ws AND receipt.actor_id = p_actor AND receipt.request_id = p_request
    AND receipt.operation = 'completion' AND receipt.expires_at > statement_timestamp()
    AND receipt.result->>'transition_id' = proof.transition_id::text
  CROSS JOIN private.task_recurrence_control AS control
  WHERE proof.ws_id = p_ws AND proof.actor_id = p_actor AND proof.task_id = p_task
    AND proof.expires_at > statement_timestamp() AND control.request_enabled
    AND series.state = 'active'
    AND (proof.revision, proof.progress, proof.cursor_date, proof.global_epoch, proof.workspace_epoch)
      = (series.revision, series.progress, series.cursor_date, control.epoch, workspace.epoch)
    AND EXISTS (SELECT 1 FROM public.workspace_members WHERE ws_id = p_ws AND user_id = p_actor AND type = 'MEMBER')
    AND public.has_workspace_permission(p_ws, p_actor, 'manage_projects');
  RETURN result;
END;
$$;

-- Reserve the receipt and capture in one transaction. A conflicting request ID
-- must never complete a different task before the generation RPC detects it.
CREATE FUNCTION private.task_recurrence_begin_completion(
  p_ws uuid, p_actor uuid, p_task uuid, p_list uuid, p_sort_key bigint,
  p_request uuid, p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
DECLARE
  series private.task_recurrence_series%ROWTYPE;
  scope jsonb := jsonb_build_object('tasks', jsonb_build_array(p_task));
  input jsonb := jsonb_build_array(jsonb_build_object('task_id', p_task, 'list_id', p_list, 'sort_key', p_sort_key));
  result jsonb;
  captured jsonb;
BEGIN
  PERFORM private.task_recurrence_request_actor(p_actor);
  IF private.task_recurrence_request_gate(p_ws) IS NULL THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;
  SELECT series_row.* INTO series FROM private.task_recurrence_series AS series_row
  JOIN private.task_recurrence_occurrences AS occurrence ON occurrence.series_id = series_row.id
  WHERE series_row.ws_id = p_ws AND occurrence.task_id = p_task FOR UPDATE OF series_row;
  IF NOT FOUND OR NOT private.task_recurrence_lock_member_edit(p_ws, p_actor) THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;
  PERFORM 1 FROM public.tasks AS task
  JOIN public.task_lists AS list ON list.id = task.list_id AND list.board_id = series.board_id
  JOIN public.workspace_boards AS board ON board.id = list.board_id AND board.ws_id = p_ws
  JOIN public.task_lists AS destination ON destination.id = p_list AND destination.board_id = board.id
  WHERE task.id = p_task AND task.deleted_at IS NULL AND list.deleted IS DISTINCT FROM true
    AND destination.deleted IS DISTINCT FROM true AND destination.archived IS DISTINCT FROM true
    AND board.deleted_at IS NULL AND board.archived_at IS NULL
  FOR SHARE OF list, board, destination;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE'; END IF;

  result := private.task_recurrence_request_replay(p_ws,p_actor,p_request,p_expires_at,'completion',scope,input);
  IF result IS NOT NULL THEN RETURN result - 'transition_id'; END IF;
  captured := private.task_recurrence_capture_completion(p_ws,p_actor,p_task,p_list,p_sort_key);
  result := jsonb_build_object('status', captured->>'status', 'pending', captured->>'transition_id' IS NOT NULL,
    'transition_id', captured->'transition_id');
  PERFORM private.task_recurrence_request_receipt(
    p_ws,p_actor,p_request,p_expires_at,'completion',scope,input,result
  );
  RETURN result - 'transition_id';
END;
$$;

CREATE FUNCTION private.task_recurrence_complete(
  p_ws uuid, p_actor uuid, p_request uuid, p_expires_at timestamptz, p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '15s'
AS $$
DECLARE
  gate bigint[];
  series private.task_recurrence_series%ROWTYPE;
  proof private.task_recurrence_transitions%ROWTYPE;
  candidate record;
  scope jsonb;
  input jsonb;
  result jsonb;
  final_result jsonb;
  reserved_transition uuid;
  results jsonb := '[]'::jsonb;
  item_count integer;
  task_ids jsonb;
BEGIN
  PERFORM private.task_recurrence_request_actor(p_actor);
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR octet_length(p_items::text) > 131072 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_COMPLETION_LIMIT';
  END IF;
  item_count := jsonb_array_length(p_items);
  IF item_count NOT BETWEEN 1 AND 50 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR (item - ARRAY['task_id','list_id','sort_key','transition_id','plan']) <> '{}'::jsonb
      OR item->>'task_id' IS NULL OR item->>'list_id' IS NULL OR item->>'sort_key' IS NULL
  ) OR (SELECT count(DISTINCT item->>'task_id') FROM jsonb_array_elements(p_items) AS item) <> item_count THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_COMPLETION_LIMIT';
  END IF;
  gate := private.task_recurrence_request_gate(p_ws);
  IF gate IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE'; END IF;
  PERFORM 1 FROM private.task_recurrence_series AS series_row
  WHERE series_row.id IN (SELECT occurrence.series_id FROM private.task_recurrence_occurrences AS occurrence
    WHERE occurrence.ws_id = p_ws AND occurrence.task_id IN (
      SELECT (item->>'task_id')::uuid FROM jsonb_array_elements(p_items) AS item
    )) ORDER BY series_row.id FOR UPDATE;
  IF NOT private.task_recurrence_lock_member_edit(p_ws, p_actor) THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;
  SELECT jsonb_agg(task.id ORDER BY task.id) INTO task_ids
  FROM private.task_recurrence_occurrences AS occurrence
  JOIN private.task_recurrence_series AS series_row ON series_row.id = occurrence.series_id
  JOIN public.tasks AS task ON task.id = occurrence.task_id
  JOIN public.task_lists AS list ON list.id = task.list_id AND list.board_id = series_row.board_id
  JOIN public.workspace_boards AS board ON board.id = list.board_id AND board.ws_id = p_ws
  WHERE occurrence.ws_id = p_ws AND task.deleted_at IS NULL AND list.deleted IS DISTINCT FROM true
    AND board.deleted_at IS NULL AND board.archived_at IS NULL
    AND task.id IN (SELECT (item->>'task_id')::uuid FROM jsonb_array_elements(p_items) AS item);
  IF task_ids IS NULL OR jsonb_array_length(task_ids) <> item_count THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'task_id', (item->>'task_id')::uuid, 'list_id', (item->>'list_id')::uuid, 'sort_key', (item->>'sort_key')::bigint
  ) ORDER BY item->>'task_id') INTO input FROM jsonb_array_elements(p_items) AS item;
  scope := jsonb_build_object('tasks', task_ids);
  result := private.task_recurrence_request_replay(p_ws, p_actor, p_request, p_expires_at, 'completion', scope, input);
  IF result IS NOT NULL AND (result->>'pending') IS DISTINCT FROM 'true' THEN RETURN result - 'transition_id'; END IF;
  IF result IS NULL THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_CAPTURE_REQUIRED';
  END IF;
  reserved_transition := (result->>'transition_id')::uuid;

  FOR candidate IN
    SELECT occurrence.series_id, occurrence.task_id, occurrence.occurrence_date, item
    FROM jsonb_array_elements(p_items) AS item
    JOIN private.task_recurrence_occurrences AS occurrence ON occurrence.task_id = (item->>'task_id')::uuid
      AND occurrence.ws_id = p_ws ORDER BY occurrence.series_id, occurrence.task_id
  LOOP
    SELECT * INTO series FROM private.task_recurrence_series WHERE id = candidate.series_id;
    SELECT * INTO proof FROM private.task_recurrence_transitions
    WHERE transition_id = reserved_transition AND transition_id = (candidate.item->>'transition_id')::uuid
      AND task_id = candidate.task_id AND series_id = series.id AND ws_id = p_ws AND actor_id = p_actor;
    IF NOT FOUND OR series.state <> 'active' OR proof.expires_at <= clock_timestamp()
      OR (proof.revision, proof.progress, proof.cursor_date, proof.global_epoch, proof.workspace_epoch)
         IS DISTINCT FROM (series.revision, series.progress, series.cursor_date, gate[1], gate[2])
      OR NOT private.task_recurrence_lock_member_edit(p_ws, series.owner_id)
      OR candidate.occurrence_date IS DISTINCT FROM (
        SELECT occurrence_date FROM private.task_recurrence_occurrences
        WHERE series_id = series.id AND state = 'created' ORDER BY occurrence_date DESC LIMIT 1
      ) THEN CONTINUE; END IF;
    PERFORM 1 FROM public.tasks AS task
    JOIN public.task_lists AS list ON list.id = task.list_id AND list.board_id = series.board_id
    JOIN public.workspace_boards AS board ON board.id = list.board_id AND board.ws_id = p_ws
    WHERE task.id = proof.task_id AND task.deleted_at IS NULL AND list.deleted IS DISTINCT FROM true
      AND board.deleted_at IS NULL AND board.archived_at IS NULL
      AND NOT private.task_recurrence_is_open(task.deleted_at, task.completed_at, task.closed_at, list.status)
    FOR SHARE OF task, list, board;
    IF NOT FOUND THEN CONTINUE; END IF;
    result := private.task_recurrence_step(series, candidate.item->'plan', 'completion', p_actor);
    IF result->>'task_id' IS NOT NULL THEN results := results || jsonb_build_array(result->'task_id'); END IF;
  END LOOP;
  final_result := jsonb_build_object('status', 'completed', 'task_ids', results);
  PERFORM private.task_recurrence_request_expiry(p_expires_at);
  UPDATE private.task_recurrence_receipts SET result = final_result
  WHERE ws_id = p_ws AND actor_id = p_actor AND request_id = p_request;
  RETURN final_result;
END;
$$;

REVOKE ALL ON FUNCTION
  private.task_recurrence_prepare_create(uuid, uuid, uuid),
  private.task_recurrence_create(uuid, uuid, uuid, uuid, timestamptz, bigint, bigint, jsonb, jsonb),
  private.task_recurrence_edit(uuid, uuid, uuid, uuid, uuid, timestamptz, bigint, bigint, jsonb, jsonb),
  private.task_recurrence_set_status(uuid, uuid, uuid, uuid, uuid, timestamptz, bigint, bigint, text, uuid, jsonb),
  private.task_recurrence_read(uuid, uuid, uuid[], boolean),
  private.task_recurrence_prepare_completion(uuid, uuid, uuid, uuid),
  private.task_recurrence_begin_completion(uuid, uuid, uuid, uuid, bigint, uuid, timestamptz),
  private.task_recurrence_complete(uuid, uuid, uuid, timestamptz, jsonb)
FROM PUBLIC, anon, authenticated, service_role, task_recurrence_operator;
GRANT EXECUTE ON FUNCTION
  private.task_recurrence_prepare_create(uuid, uuid, uuid),
  private.task_recurrence_create(uuid, uuid, uuid, uuid, timestamptz, bigint, bigint, jsonb, jsonb),
  private.task_recurrence_edit(uuid, uuid, uuid, uuid, uuid, timestamptz, bigint, bigint, jsonb, jsonb),
  private.task_recurrence_set_status(uuid, uuid, uuid, uuid, uuid, timestamptz, bigint, bigint, text, uuid, jsonb),
  private.task_recurrence_read(uuid, uuid, uuid[], boolean),
  private.task_recurrence_prepare_completion(uuid, uuid, uuid, uuid),
  private.task_recurrence_begin_completion(uuid, uuid, uuid, uuid, bigint, uuid, timestamptz),
  private.task_recurrence_complete(uuid, uuid, uuid, timestamptz, jsonb)
TO service_role;
