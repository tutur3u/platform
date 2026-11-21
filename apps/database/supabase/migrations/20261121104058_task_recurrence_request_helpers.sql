-- These helpers execute only through private request and producer functions.
-- tuturuuu: no-grant (internal)
SET LOCAL lock_timeout = '3s';

-- Task inserts and list moves call this invoker trigger from pinned definers.
-- tuturuuu: reviewed(alter-routine-review): N-111 pins the invoker display-number trigger for nested task writes
ALTER FUNCTION public.assign_task_display_number()
SET search_path = pg_catalog, public, pg_temp;

CREATE FUNCTION private.task_recurrence_request_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- Subjectless service calls allow the server to supply the verified actor.
  -- This also keeps ordinary assignee triggers out of generated-task fan-out.
  IF p_actor IS NULL OR auth.uid() IS NOT NULL THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE = 'TASK_RECURRENCE_ACTOR';
  END IF;
END;
$$;

CREATE FUNCTION private.task_recurrence_request_gate(p_ws uuid)
RETURNS bigint[]
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  control private.task_recurrence_control%ROWTYPE;
  workspace private.task_recurrence_workspace%ROWTYPE;
BEGIN
  SELECT * INTO STRICT control FROM private.task_recurrence_control WHERE singleton FOR SHARE;
  IF NOT control.request_enabled THEN RETURN NULL; END IF;
  SELECT * INTO workspace FROM private.task_recurrence_workspace WHERE ws_id = p_ws FOR UPDATE;
  IF workspace.enabled IS DISTINCT FROM true THEN RETURN NULL; END IF;
  RETURN ARRAY[control.epoch, workspace.epoch];
END;
$$;

CREATE FUNCTION private.task_recurrence_request_expiry(p_expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  observed_at timestamptz := clock_timestamp();
BEGIN
  IF p_expires_at IS NULL OR NOT isfinite(p_expires_at)
    OR p_expires_at <= observed_at OR p_expires_at > observed_at + interval '7 days' THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_RECEIPT_EXPIRED';
  END IF;
END;
$$;

CREATE FUNCTION private.task_recurrence_request_replay(
  p_ws uuid, p_actor uuid, p_request uuid, p_expires_at timestamptz,
  p_operation text, p_scope jsonb, p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  prior private.task_recurrence_receipts%ROWTYPE;
BEGIN
  PERFORM private.task_recurrence_request_expiry(p_expires_at);
  IF p_request IS NULL THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_REQUEST_REQUIRED';
  END IF;
  SELECT * INTO prior FROM private.task_recurrence_receipts
  WHERE ws_id = p_ws AND actor_id = p_actor AND request_id = p_request;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM private.task_recurrence_request_expiry(prior.expires_at);

  -- Check the saved resource before disclosing replay or a digest conflict.
  -- An explicit linked delete may replay against its soft-delete tombstone.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(prior.result->'task_ids', '[]'::jsonb)
      || CASE WHEN prior.result->>'task_id' IS NOT NULL
        THEN jsonb_build_array(prior.result->'task_id') ELSE '[]'::jsonb END) AS saved(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks AS task
      JOIN private.task_recurrence_occurrences AS occurrence ON occurrence.task_id = task.id AND occurrence.ws_id = p_ws
      JOIN private.task_recurrence_series AS series ON series.id = occurrence.series_id AND series.ws_id = p_ws
      JOIN public.task_lists AS list ON list.id = task.list_id
      JOIN public.workspace_boards AS board ON board.id = list.board_id AND board.id = series.board_id
      WHERE task.id = saved.id::uuid AND board.ws_id = p_ws
        AND board.deleted_at IS NULL AND board.archived_at IS NULL AND list.deleted IS DISTINCT FROM true
        AND (task.deleted_at IS NULL OR (
          prior.operation = 'status' AND prior.scope->>'action' = 'delete'
          AND task.id = (prior.scope->>'delete_task')::uuid
        ))
      FOR SHARE OF task, list, board
    )
  ) THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;
  IF (prior.operation, prior.scope, prior.input_hash, prior.expires_at) IS DISTINCT FROM
     (p_operation, p_scope, sha256(convert_to(p_input::text, 'UTF8')), p_expires_at) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_REQUEST_CONFLICT';
  END IF;
  RETURN prior.result;
END;
$$;

CREATE FUNCTION private.task_recurrence_request_receipt(
  p_ws uuid, p_actor uuid, p_request uuid, p_expires_at timestamptz,
  p_operation text, p_scope jsonb, p_input jsonb, p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM private.task_recurrence_request_expiry(p_expires_at);
  INSERT INTO private.task_recurrence_receipts (
    ws_id, actor_id, request_id, expires_at, operation, scope, input_hash, result
  ) VALUES (
    p_ws, p_actor, p_request, p_expires_at, p_operation, p_scope,
    sha256(convert_to(p_input::text, 'UTF8')), p_result
  );
  RETURN p_result;
END;
$$;

CREATE FUNCTION private.task_recurrence_reserve_active(p_series private.task_recurrence_series)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  workspace_slot smallint;
  actor_slot smallint;
BEGIN
  IF EXISTS (SELECT 1 FROM private.task_recurrence_active_slots WHERE series_id = p_series.id) THEN RETURN; END IF;
  SELECT slot INTO workspace_slot FROM generate_series(1, 200) AS slot
  WHERE NOT EXISTS (
    SELECT 1 FROM private.task_recurrence_active_slots WHERE ws_id = p_series.ws_id AND ws_slot = slot
  ) ORDER BY slot LIMIT 1;
  SELECT slot INTO actor_slot FROM generate_series(1, 50) AS slot
  WHERE NOT EXISTS (
    SELECT 1 FROM private.task_recurrence_active_slots
    WHERE ws_id = p_series.ws_id AND owner_id = p_series.owner_id AND owner_slot = slot
  ) ORDER BY slot LIMIT 1;
  IF workspace_slot IS NULL OR actor_slot IS NULL THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_ACTIVE_CAPACITY';
  END IF;
  INSERT INTO private.task_recurrence_active_slots (series_id, ws_id, owner_id, ws_slot, owner_slot)
  VALUES (p_series.id, p_series.ws_id, p_series.owner_id, workspace_slot, actor_slot);
END;
$$;

CREATE FUNCTION private.task_recurrence_copy_ids(p_value jsonb)
RETURNS uuid[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  ids uuid[];
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'array' THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_TEMPLATE_IDS';
  END IF;
  IF jsonb_array_length(p_value) > 50 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_TEMPLATE_IDS';
  END IF;
  SELECT coalesce(array_agg(DISTINCT item::uuid ORDER BY item::uuid), ARRAY[]::uuid[])
    INTO ids FROM jsonb_array_elements_text(p_value) AS item;
  IF cardinality(ids) <> jsonb_array_length(p_value) OR array_position(ids, NULL) IS NOT NULL THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_TEMPLATE_IDS';
  END IF;
  RETURN ids;
END;
$$;

-- The producer needs only server-created plans. Keep the stored specification
-- and relation operations bounded independently of the HTTP body checks.
CREATE FUNCTION private.task_recurrence_validate_spec(p_spec jsonb)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  rule jsonb := p_spec->'rule';
  template jsonb := p_spec->'template';
  anchor date := (p_spec->>'anchor_date')::date;
BEGIN
  IF jsonb_typeof(p_spec) IS DISTINCT FROM 'object' OR octet_length(p_spec::text) > 36864
    OR (p_spec - ARRAY['rule','template','anchor_date','due_time','start_offset_days']) <> '{}'::jsonb
    OR jsonb_typeof(rule) IS DISTINCT FROM 'object' OR octet_length(rule::text) > 2048
    OR (rule->>'version' = '1') IS DISTINCT FROM true
    OR (rule->>'frequency' IN ('daily','weekly','monthly','yearly')) IS DISTINCT FROM true
    OR (rule - ARRAY['version','frequency','interval','timeZone','weekStartsOn','weekdays','monthDay','monthDayOverflow','month','end']) <> '{}'::jsonb
    OR (rule->>'frequency' = 'weekly' AND (
      jsonb_typeof(rule->'weekdays') IS DISTINCT FROM 'array'
      OR NOT ((rule->'weekdays') ? (ARRAY['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow FROM anchor)::integer])
    ))
    OR (rule->>'frequency' IN ('monthly','yearly') AND (
      (rule->>'monthDayOverflow') IS DISTINCT FROM 'last-day'
      OR ((rule->>'monthDay')::integer BETWEEN 1 AND 31) IS DISTINCT FROM true
      OR extract(day FROM anchor)::integer <> least(
        (rule->>'monthDay')::integer, extract(day FROM (date_trunc('month',anchor) + interval '1 month - 1 day'))::integer)
    ))
    OR (rule->>'frequency' = 'yearly' AND coalesce((rule->>'month')::integer,0) <> extract(month FROM anchor)::integer)
    OR ((rule->>'interval')::integer BETWEEN 1 AND 99) IS DISTINCT FROM true
    OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = rule->>'timeZone')
    OR (rule #>> '{end,type}' IN ('never','count','until')) IS DISTINCT FROM true
    OR (rule #>> '{end,type}' = 'count'
      AND ((rule #>> '{end,count}')::integer BETWEEN 1 AND 1000) IS DISTINCT FROM true)
    OR (rule #>> '{end,type}' = 'until' AND (
      (rule #>> '{end,date}')::date BETWEEN anchor AND (anchor + interval '5 years')::date
    ) IS DISTINCT FROM true)
    OR (anchor BETWEEN DATE '1970-01-01' AND DATE '2999-12-31') IS DISTINCT FROM true
    OR ((p_spec->>'start_offset_days')::integer BETWEEN 0 AND 365) IS DISTINCT FROM true
    OR coalesce((p_spec->>'due_time')::time >= TIME '24:00:00', false)
    OR jsonb_typeof(template) IS DISTINCT FROM 'object' OR octet_length(template::text) > 32768
    OR (template - ARRAY['title','description','priority','estimate','labels','projects','assignees']) <> '{}'::jsonb
    OR (char_length(btrim(template->>'title')) BETWEEN 1 AND 255) IS DISTINCT FROM true THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_SPEC';
  END IF;
  PERFORM private.task_recurrence_copy_ids(template->'labels'),
    private.task_recurrence_copy_ids(template->'projects'),
    private.task_recurrence_copy_ids(template->'assignees');
END;
$$;

CREATE FUNCTION private.task_recurrence_generation_list(p_series private.task_recurrence_series)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  default_list uuid;
  usable uuid;
BEGIN
  SELECT default_list_id INTO default_list FROM public.workspace_boards
  WHERE id = p_series.board_id AND ws_id = p_series.ws_id
    AND deleted_at IS NULL AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.task_lists WHERE id IN (p_series.list_id, default_list) ORDER BY id FOR SHARE;
  IF default_list IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.task_lists WHERE id = default_list AND board_id = p_series.board_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.task_lists WHERE id = p_series.list_id AND board_id = p_series.board_id
      AND archived IS DISTINCT FROM true AND deleted IS DISTINCT FROM true AND status NOT IN ('done','closed')
  ) THEN
    RETURN NULL;
  END IF;
  SELECT id INTO usable FROM public.task_lists
  WHERE id IN (p_series.list_id, default_list) AND board_id = p_series.board_id
    AND archived IS DISTINCT FROM true AND deleted IS DISTINCT FROM true
    AND status NOT IN ('done','closed')
  ORDER BY (id = p_series.list_id) DESC NULLS LAST LIMIT 1;
  RETURN usable;
END;
$$;

CREATE FUNCTION private.task_recurrence_materialize(
  p_series private.task_recurrence_series, p_list uuid,
  p_start_at timestamptz, p_end_at timestamptz, p_description_state jsonb
)
RETURNS public.tasks
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  task public.tasks%ROWTYPE;
  description_state smallint[];
  new_sort_key bigint;
  assignees uuid[] := private.task_recurrence_copy_ids(p_series.template->'assignees');
  labels uuid[] := private.task_recurrence_copy_ids(p_series.template->'labels');
  projects uuid[] := private.task_recurrence_copy_ids(p_series.template->'projects');
BEGIN
  -- Legacy assignment and watcher notification paths must stay outside this
  -- producer. Their actor-sensitive triggers return early without a subject.
  -- Every copied assignee instead gets at most one origin notification below.
  PERFORM private.task_recurrence_request_actor(p_series.owner_id);
  IF p_description_state IS NOT NULL AND p_description_state <> 'null'::jsonb THEN
    IF jsonb_typeof(p_description_state) <> 'array' OR octet_length(p_description_state::text) > 110000 THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_DESCRIPTION_STATE';
    END IF;
    SELECT coalesce(array_agg(value::smallint ORDER BY ord), ARRAY[]::smallint[]) INTO description_state
    FROM jsonb_array_elements_text(p_description_state) WITH ORDINALITY AS entry(value, ord);
  END IF;
  SELECT CASE WHEN sort_key > 9223372036853775807 THEN sort_key ELSE sort_key + 1000000 END
  INTO new_sort_key
  FROM public.tasks WHERE list_id = p_list AND deleted_at IS NULL AND sort_key IS NOT NULL
  ORDER BY sort_key DESC LIMIT 1;
  INSERT INTO public.tasks (
    list_id, name, description, description_yjs_state, priority, estimation_points,
    start_date, end_date, sort_key, creator_id
  )
  VALUES (p_list, p_series.template->>'title', p_series.template->>'description', description_state,
    (p_series.template->>'priority')::public.task_priority,
    (p_series.template->>'estimate')::smallint, p_start_at, p_end_at, coalesce(new_sort_key, 1000000), p_series.owner_id)
  RETURNING * INTO task;

  INSERT INTO public.task_labels (task_id, label_id)
  SELECT task.id, label.id FROM public.workspace_task_labels AS label
  WHERE label.ws_id = p_series.ws_id AND label.id = ANY(labels)
  ORDER BY label.id FOR SHARE OF label;
  INSERT INTO public.task_project_tasks (task_id, project_id)
  SELECT task.id, project.id FROM public.task_projects AS project
  WHERE project.ws_id = p_series.ws_id AND project.id = ANY(projects)
    AND project.deleted IS DISTINCT FROM true AND project.archived IS DISTINCT FROM true
  ORDER BY project.id FOR SHARE OF project;

  WITH added AS (
    INSERT INTO public.task_assignees (task_id, user_id)
    SELECT task.id, member.user_id FROM public.workspace_members AS member
    WHERE member.ws_id = p_series.ws_id AND member.type = 'MEMBER' AND member.user_id = ANY(assignees)
    ORDER BY member.user_id FOR SHARE OF member RETURNING user_id
  )
  SELECT coalesce(array_agg(added.user_id), ARRAY[]::uuid[]) INTO assignees FROM added;
  PERFORM public.insert_task_history(task.id, 'assignee_added', NULL, NULL,
    jsonb_build_object('user_id', assignee),
    jsonb_build_object('ws_id', p_series.ws_id, 'board_id', p_series.board_id), p_series.owner_id)
  FROM unnest(assignees) AS assignee;
  PERFORM public.create_notification(
    p_ws_id := p_series.ws_id, p_user_id := assignee,
    p_type := 'task_assignee_added', p_title := 'Assigned to task',
    p_description := task.name,
    p_data := jsonb_build_object('task_id', task.id, 'board_id', p_series.board_id),
    p_entity_type := 'task', p_entity_id := task.id, p_created_by := p_series.owner_id, p_scope := 'workspace'
  ) FROM unnest(assignees) AS assignee WHERE assignee <> p_series.owner_id;
  RETURN task;
END;
$$;

REVOKE ALL ON FUNCTION
  private.task_recurrence_request_actor(uuid),
  private.task_recurrence_request_gate(uuid),
  private.task_recurrence_request_expiry(timestamptz),
  private.task_recurrence_request_replay(uuid, uuid, uuid, timestamptz, text, jsonb, jsonb),
  private.task_recurrence_request_receipt(uuid, uuid, uuid, timestamptz, text, jsonb, jsonb, jsonb),
  private.task_recurrence_reserve_active(private.task_recurrence_series),
  private.task_recurrence_copy_ids(jsonb),
  private.task_recurrence_validate_spec(jsonb),
  private.task_recurrence_generation_list(private.task_recurrence_series),
  private.task_recurrence_materialize(private.task_recurrence_series, uuid, timestamptz, timestamptz, jsonb)
FROM PUBLIC, anon, authenticated, service_role, task_recurrence_operator;
