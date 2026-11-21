-- The dispatcher and occurrence producer are private to recurrence RPCs.
-- tuturuuu: no-grant (internal)
SET LOCAL lock_timeout = '3s';

CREATE FUNCTION private.task_recurrence_plan_date(p_value jsonb)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  result date;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) <> 'string' OR (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_PLAN_DATE';
  END IF;
  result := (p_value #>> '{}')::date;
  IF result < DATE '1970-01-01' OR result > DATE '2999-12-31' THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_PLAN_DATE';
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION private.task_recurrence_next_pattern(p_rule jsonb, p_due date)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  weekdays constant text[] := ARRAY['MO','TU','WE','TH','FR','SA','SU'];
  week_start integer := coalesce(array_position(weekdays, p_rule->>'weekStartsOn'), 1);
  first_in_week date := p_due - ((extract(isodow FROM p_due)::integer - week_start + 7) % 7);
  stride integer := (p_rule->>'interval')::integer;
  first_in_month date;
  candidate date;
  month_day integer;
BEGIN
  CASE p_rule->>'frequency'
    WHEN 'daily' THEN candidate := p_due + stride;
    WHEN 'weekly' THEN
      SELECT min(due_date) INTO candidate FROM (
        SELECT first_in_week + offset_days AS due_date FROM generate_series(0, 6) AS offset_days
        UNION ALL
        SELECT first_in_week + stride * 7 + offset_days FROM generate_series(0, 6) AS offset_days
      ) AS dates
      WHERE due_date > p_due AND (p_rule->'weekdays') ? weekdays[extract(isodow FROM due_date)::integer];
    WHEN 'monthly' THEN
      first_in_month := (make_date(extract(year FROM p_due)::integer, extract(month FROM p_due)::integer, 1)
        + make_interval(months => stride))::date;
    WHEN 'yearly' THEN
      first_in_month := make_date(extract(year FROM p_due)::integer + stride,
        coalesce((p_rule->>'month')::integer, extract(month FROM p_due)::integer), 1);
    ELSE RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_SPEC';
  END CASE;
  IF first_in_month IS NOT NULL THEN
    month_day := (p_rule->>'monthDay')::integer;
    candidate := least(first_in_month + month_day - 1, (first_in_month + interval '1 month')::date - 1);
  END IF;
  IF candidate > DATE '2999-12-31' OR candidate > (p_rule #>> '{end,date}')::date THEN RETURN NULL; END IF;
  RETURN candidate;
END;
$$;

-- PostgreSQL selects the later instant when a local wall time repeats.
-- Evaluate the offsets on either side to select the first valid instant.
CREATE FUNCTION private.task_recurrence_wall_instant(p_local timestamp, p_zone text)
RETURNS timestamptz
LANGUAGE sql STABLE STRICT
SET search_path = pg_catalog, pg_temp
AS $$
  WITH reference AS (SELECT p_local AT TIME ZONE p_zone AS guess),
  candidates AS (
    SELECT (p_local - ((probe AT TIME ZONE p_zone) - (probe AT TIME ZONE 'UTC'))) AT TIME ZONE 'UTC' AS instant
    FROM reference, unnest(ARRAY[guess - interval '36 hours', guess, guess + interval '36 hours']) AS probe
  )
  SELECT coalesce(
    (SELECT min(instant) FROM candidates WHERE instant AT TIME ZONE p_zone = p_local),
    (SELECT guess FROM reference)
  );
$$;

CREATE FUNCTION private.task_recurrence_local_start(p_date date, p_zone text)
RETURNS timestamptz
LANGUAGE plpgsql STABLE STRICT
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  guess timestamptz := private.task_recurrence_wall_instant(p_date::timestamp, p_zone);
  low bigint := extract(epoch FROM guess - interval '36 hours')::bigint;
  high bigint := extract(epoch FROM guess + interval '36 hours')::bigint;
  middle bigint;
BEGIN
  IF guess AT TIME ZONE p_zone = p_date::timestamp THEN RETURN guess; END IF;
  -- If midnight does not exist, find the first valid second of the requested
  -- local date, or the first second after an entirely absent civil date.
  WHILE high - low > 1 LOOP
    middle := low + (high - low) / 2;
    IF (to_timestamp(middle) AT TIME ZONE p_zone)::date >= p_date THEN high := middle;
    ELSE low := middle;
    END IF;
  END LOOP;
  RETURN to_timestamp(high);
END;
$$;

CREATE FUNCTION private.task_recurrence_step(
  p_series private.task_recurrence_series, p_plan jsonb, p_source text, p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  due_date date := private.task_recurrence_plan_date(p_plan->'date');
  next_date date := private.task_recurrence_plan_date(p_plan->'next_date');
  next_at timestamptz := (p_plan->>'next_at')::timestamptz;
  start_at timestamptz := (p_plan->>'start_at')::timestamptz;
  end_at timestamptz := (p_plan->>'end_at')::timestamptz;
  skip boolean := (p_plan->>'skip')::boolean;
  zone_name text := p_series.rule->>'timeZone';
  count_limit integer := (p_series.rule #>> '{end,count}')::integer;
  until_date date := (p_series.rule #>> '{end,date}')::date;
  expected_date date;
  local_start_date date := due_date - p_series.start_offset_days;
  task public.tasks%ROWTYPE;
  target_list uuid;
  open_slot smallint;
  disposition text;
BEGIN
  IF count_limit IS NULL OR p_series.consumed_count + 1 < count_limit THEN
    expected_date := private.task_recurrence_next_pattern(p_series.rule, due_date);
  END IF;
  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'object' OR octet_length(p_plan::text) > 120000
    OR (p_plan - ARRAY['version','date','next_date','next_at','start_at','end_at','skip','description_state']) <> '{}'::jsonb
    OR (p_plan->>'version') IS DISTINCT FROM '1'
    OR skip IS NULL OR due_date IS NULL OR due_date IS DISTINCT FROM p_series.cursor_date
    OR (p_series.consumed_through IS NOT NULL AND due_date <= p_series.consumed_through)
    OR (next_date IS NULL) <> (next_at IS NULL) OR next_date IS DISTINCT FROM expected_date
    OR due_date > until_date OR next_date > until_date
    OR coalesce(p_series.consumed_count >= count_limit, false)
    OR (count_limit IS NOT NULL AND p_series.consumed_count + 1 >= count_limit AND next_date IS NOT NULL)
    OR next_at IS DISTINCT FROM private.task_recurrence_local_start(next_date - p_series.start_offset_days, zone_name)
    OR skip IS DISTINCT FROM (
      (private.task_recurrence_local_start(due_date, zone_name) AT TIME ZONE zone_name)::date <> due_date
      OR (private.task_recurrence_local_start(local_start_date, zone_name) AT TIME ZONE zone_name)::date <> local_start_date
    )
    OR (NOT skip AND (
      start_at IS DISTINCT FROM CASE WHEN p_series.due_time IS NULL
        THEN private.task_recurrence_local_start(local_start_date + 1, zone_name) - interval '1 millisecond'
        ELSE private.task_recurrence_wall_instant(local_start_date + p_series.due_time, zone_name) END
      OR end_at IS DISTINCT FROM CASE WHEN p_series.due_time IS NULL
        THEN private.task_recurrence_local_start(due_date + 1, zone_name) - interval '1 millisecond'
        ELSE private.task_recurrence_wall_instant(due_date + p_series.due_time, zone_name) END
    )) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_STALE_PLAN';
  END IF;

  IF skip THEN
    disposition := 'skipped';
  ELSE
    target_list := private.task_recurrence_generation_list(p_series);
    IF target_list IS NULL THEN
      UPDATE private.task_recurrence_series SET state = 'paused', state_reason = 'list_unavailable',
        revision = revision + 1 WHERE id = p_series.id;
      DELETE FROM private.task_recurrence_active_slots WHERE series_id = p_series.id;
      DELETE FROM private.task_recurrence_transitions WHERE series_id = p_series.id;
      RETURN jsonb_build_object('series_id', p_series.id, 'state', 'paused');
    END IF;
    SELECT slot INTO open_slot FROM generate_series(1, 3) AS slot
    WHERE NOT EXISTS (
      SELECT 1 FROM private.task_recurrence_occurrences AS occurrence
      WHERE occurrence.series_id = p_series.id AND occurrence.open_slot = slot
    ) ORDER BY slot LIMIT 1;
    IF open_slot IS NULL THEN
      disposition := 'held';
    ELSE
      disposition := 'created';
      task := private.task_recurrence_materialize(p_series, target_list, start_at, end_at, p_plan->'description_state');
    END IF;
  END IF;
  INSERT INTO private.task_recurrence_occurrences (
    series_id, ws_id, occurrence_date, task_id, task_list_id, task_write_version,
    open_slot, state, skip_reason, source, request_actor_id, series_revision
  ) VALUES (
    p_series.id, p_series.ws_id, due_date, task.id, task.list_id,
    extract(epoch FROM task.updated_at)::text, open_slot, disposition,
    CASE WHEN skip THEN 'nonexistent_civil_date' END, p_source, p_actor, p_series.revision
  );
  UPDATE private.task_recurrence_series SET
    cursor_date = next_date, generate_at = next_at, consumed_through = due_date,
    consumed_count = CASE WHEN count_limit IS NULL THEN consumed_count ELSE consumed_count + 1 END,
    progress = progress + 1, state = CASE WHEN next_date IS NULL THEN 'ended' ELSE 'active' END
  WHERE id = p_series.id;
  IF next_date IS NULL THEN
    DELETE FROM private.task_recurrence_active_slots WHERE series_id = p_series.id;
  END IF;
  DELETE FROM private.task_recurrence_transitions WHERE series_id = p_series.id;
  UPDATE private.task_recurrence_claims SET state = 'stale' WHERE series_id = p_series.id AND state = 'claimed';
  RETURN jsonb_build_object('series_id', p_series.id, 'task_id', task.id, 'state', disposition);
END;
$$;

CREATE FUNCTION private.task_recurrence_apply_request(
  p_operation text, p_ws uuid, p_actor uuid, p_list uuid, p_series uuid, p_task uuid,
  p_request uuid, p_expires_at timestamptz, p_global_epoch bigint, p_ws_epoch bigint,
  p_revision bigint, p_progress bigint, p_spec jsonb, p_plan jsonb,
  p_action text, p_delete_task uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  gate bigint[];
  series private.task_recurrence_series%ROWTYPE;
  board_id uuid;
  scope jsonb;
  input jsonb;
  result jsonb;
  anchor date;
  next_at timestamptz;
  count_used integer;
  resume_date date;
  resume_fence date;
  resume_count integer := 0;
  resume_limit integer;
  local_today date;
BEGIN
  PERFORM private.task_recurrence_request_actor(p_actor);
  gate := private.task_recurrence_request_gate(p_ws);
  IF gate IS NULL THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;
  IF p_operation <> 'create' THEN
    SELECT * INTO series FROM private.task_recurrence_series
    WHERE id = p_series AND ws_id = p_ws FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE'; END IF;
  END IF;
  IF NOT private.task_recurrence_lock_member_edit(p_ws, p_actor) THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;

  IF p_operation = 'create' THEN
    SELECT board.id INTO board_id FROM public.task_lists AS list JOIN public.workspace_boards AS board ON board.id = list.board_id
    WHERE list.id = p_list AND board.ws_id = p_ws
      AND list.status NOT IN ('done','closed') AND list.deleted IS DISTINCT FROM true AND list.archived IS DISTINCT FROM true
      AND board.deleted_at IS NULL AND board.archived_at IS NULL FOR SHARE OF list, board;
  ELSE
    SELECT board.id INTO board_id FROM private.task_recurrence_occurrences AS occurrence
    JOIN public.tasks AS task ON task.id = occurrence.task_id
    JOIN public.task_lists AS list ON list.id = task.list_id
    JOIN public.workspace_boards AS board ON board.id = list.board_id
    WHERE occurrence.series_id = series.id AND task.id = p_task AND board.id = series.board_id
      AND board.ws_id = p_ws AND board.deleted_at IS NULL AND board.archived_at IS NULL
      AND list.deleted IS DISTINCT FROM true
      AND (task.deleted_at IS NULL OR (p_action = 'delete' AND p_delete_task = p_task))
    FOR SHARE OF task, list, board;
  END IF;
  IF board_id IS NULL OR (p_delete_task IS NOT NULL AND (p_delete_task <> p_task OR p_action <> 'delete')) THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'TASK_RECURRENCE_UNAVAILABLE';
  END IF;
  scope := jsonb_build_object('board_id', board_id, 'list_id', p_list,
    'series_id', p_series, 'task_id', p_task, 'action', p_action, 'delete_task', p_delete_task);
  input := jsonb_build_object('spec', p_spec, 'revision', p_revision, 'progress', p_progress);
  result := private.task_recurrence_request_replay(p_ws, p_actor, p_request, p_expires_at, p_operation, scope, input);
  IF result IS NOT NULL THEN RETURN result; END IF;

  IF p_operation = 'create' THEN
    IF gate IS DISTINCT FROM ARRAY[p_global_epoch, p_ws_epoch] THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_GATE_CHANGED';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text, 548433));
    IF (SELECT count(*) FROM (
      SELECT 1 FROM private.task_recurrence_receipts
      WHERE actor_id = p_actor AND operation = 'create'
        AND created_at >= clock_timestamp() - interval '1 minute'
      LIMIT 30
    ) AS recent) >= 30 THEN
      RAISE SQLSTATE 'PT429' USING MESSAGE = 'TASK_RECURRENCE_RATE_LIMIT';
    END IF;
    PERFORM private.task_recurrence_validate_spec(p_spec);
    anchor := (p_spec->>'anchor_date')::date;
    next_at := private.task_recurrence_local_start(anchor - (p_spec->>'start_offset_days')::integer, p_spec #>> '{rule,timeZone}');
    IF next_at IS DISTINCT FROM (p_plan->>'anchor_at')::timestamptz THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_STALE_PLAN';
    END IF;
    INSERT INTO private.task_recurrence_series (
      ws_id, board_id, list_id, owner_id, rule, template, anchor_date, due_time,
      start_offset_days, state, cursor_date, generate_at
    ) VALUES (
      p_ws, board_id, p_list, p_actor, p_spec->'rule', p_spec->'template', anchor,
      (p_spec->>'due_time')::time, (p_spec->>'start_offset_days')::smallint, 'active', anchor, next_at
    ) RETURNING * INTO series;
    result := private.task_recurrence_step(series, p_plan - 'anchor_at', 'create', p_actor);
    SELECT * INTO series FROM private.task_recurrence_series WHERE id = series.id;
    IF series.state = 'active' THEN PERFORM private.task_recurrence_reserve_active(series); END IF;
  ELSE
    IF (series.revision, series.progress) IS DISTINCT FROM (p_revision, p_progress) THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_STALE_SERIES';
    END IF;
    IF series.state = 'deleted' OR (series.state = 'ended' AND p_action IS DISTINCT FROM 'delete') THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_TERMINAL';
    END IF;
    IF p_operation = 'edit' THEN
      PERFORM private.task_recurrence_validate_spec(p_spec);
      anchor := (p_spec->>'anchor_date')::date;
      next_at := private.task_recurrence_local_start(anchor - (p_spec->>'start_offset_days')::integer, p_spec #>> '{rule,timeZone}');
      IF (series.consumed_through IS NOT NULL AND anchor <= series.consumed_through)
        OR next_at IS DISTINCT FROM (p_plan->>'anchor_at')::timestamptz THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_CONSUMED_DATE';
      END IF;
      count_used := CASE
        WHEN series.rule #>> '{end,type}' = 'count' AND p_spec #>> '{rule,end,type}' = 'count'
        THEN series.consumed_count ELSE 0 END;
      IF count_used >= (p_spec #>> '{rule,end,count}')::integer THEN
        anchor := NULL;
        next_at := NULL;
        DELETE FROM private.task_recurrence_active_slots WHERE series_id = series.id;
      END IF;
      UPDATE private.task_recurrence_series SET rule = p_spec->'rule', template = p_spec->'template',
        anchor_date = (p_spec->>'anchor_date')::date, due_time = (p_spec->>'due_time')::time,
        state = CASE WHEN anchor IS NULL THEN 'ended' ELSE state END,
        start_offset_days = (p_spec->>'start_offset_days')::smallint,
        cursor_date = anchor, generate_at = next_at, consumed_count = count_used,
        revision = revision + 1
      WHERE id = series.id RETURNING * INTO series;
    ELSIF p_action IN ('pause','end','delete') THEN
      UPDATE private.task_recurrence_series SET
        state = CASE p_action WHEN 'pause' THEN 'paused' WHEN 'end' THEN 'ended' ELSE 'deleted' END,
        state_reason = CASE WHEN p_action = 'pause' THEN 'user_paused' END,
        revision = revision + 1
      WHERE id = series.id RETURNING * INTO series;
      DELETE FROM private.task_recurrence_active_slots WHERE series_id = series.id;
      IF p_delete_task IS NOT NULL THEN
        UPDATE public.tasks SET deleted_at = coalesce(deleted_at, clock_timestamp()) WHERE id = p_delete_task;
      END IF;
    ELSIF p_action = 'resume' AND series.state = 'paused' AND series.cursor_date IS NOT NULL
      AND private.task_recurrence_lock_member_edit(p_ws, series.owner_id) THEN
      IF private.task_recurrence_generation_list(series) IS NULL THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_LIST_UNAVAILABLE';
      END IF;
      local_today := (clock_timestamp() AT TIME ZONE (series.rule->>'timeZone'))::date;
      resume_date := series.cursor_date;
      resume_fence := series.consumed_through;
      resume_limit := (series.rule #>> '{end,count}')::integer;
      count_used := series.consumed_count;
      WHILE resume_date < local_today LOOP
        resume_count := resume_count + 1;
        IF resume_count > 5000 THEN
          RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_PLANNER_BUDGET';
        END IF;
        resume_fence := resume_date;
        IF resume_limit IS NOT NULL THEN count_used := count_used + 1; END IF;
        IF count_used >= resume_limit THEN resume_date := NULL;
        ELSE resume_date := private.task_recurrence_next_pattern(series.rule, resume_date);
        END IF;
      END LOOP;
      UPDATE private.task_recurrence_series SET
        state = CASE WHEN resume_date IS NULL THEN 'ended' ELSE 'active' END, state_reason = NULL,
        revision = revision + 1, progress = progress + resume_count, cursor_date = resume_date,
        generate_at = CASE WHEN resume_date = series.cursor_date THEN series.generate_at
          ELSE private.task_recurrence_local_start(resume_date - series.start_offset_days, series.rule->>'timeZone') END,
        consumed_through = resume_fence, consumed_count = count_used
      WHERE id = series.id RETURNING * INTO series;
      IF series.state = 'active' THEN PERFORM private.task_recurrence_reserve_active(series); END IF;
    ELSE
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_STATUS';
    END IF;
    DELETE FROM private.task_recurrence_transitions WHERE series_id = series.id;
    UPDATE private.task_recurrence_claims SET state = 'stale' WHERE series_id = series.id AND state = 'claimed';
    result := jsonb_build_object('series_id', series.id, 'task_id', p_delete_task,
      'state', series.state, 'revision', series.revision, 'progress', series.progress,
      'skipped', resume_count, 'materialized_task', CASE WHEN p_operation = 'edit' THEN 'retained' END);
  END IF;

  RETURN private.task_recurrence_request_receipt(
    p_ws, p_actor, p_request, p_expires_at, p_operation, scope, input, result
  );
END;
$$;

REVOKE ALL ON FUNCTION
  private.task_recurrence_plan_date(jsonb),
  private.task_recurrence_next_pattern(jsonb, date),
  private.task_recurrence_wall_instant(timestamp, text),
  private.task_recurrence_local_start(date, text),
  private.task_recurrence_step(private.task_recurrence_series, jsonb, text, uuid),
  private.task_recurrence_apply_request(text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz,
    bigint, bigint, bigint, bigint, jsonb, jsonb, text, uuid)
FROM PUBLIC, anon, authenticated, service_role, task_recurrence_operator;
