-- Scheduler planning and settlement helpers are private to the commit RPC.
-- tuturuuu: no-grant (internal)
SET LOCAL lock_timeout = '3s';

CREATE FUNCTION private.task_recurrence_scheduler_pause(p_series uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE private.task_recurrence_series SET state = 'paused', state_reason = p_reason, revision = revision + 1
  WHERE id = p_series AND state = 'active';
  DELETE FROM private.task_recurrence_active_slots WHERE series_id = p_series;
  DELETE FROM private.task_recurrence_transitions WHERE series_id = p_series;
END;
$$;

-- Planner uses the admitted slot, rather than retry wall time, so two attempts
-- at a batch cannot choose different occurrences. Consume only the latest
-- overdue occurrence, or the first eligible occurrence for today or later.
CREATE FUNCTION private.task_recurrence_scheduler_step(
  p_series private.task_recurrence_series, p_slot bigint, p_expiry timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  series private.task_recurrence_series := p_series;
  slot_at timestamptz := to_timestamp(p_slot);
  zone_name text := series.rule->>'timeZone';
  local_date date := (slot_at AT TIME ZONE zone_name)::date;
  selected_date date := series.cursor_date;
  selected_at timestamptz := series.generate_at;
  following_date date;
  following_at timestamptz;
  skipped_count integer := 0;
  skipped_through date;
  count_limit integer := (series.rule #>> '{end,count}')::integer;
  consumed integer := series.consumed_count;
  local_start_date date;
  start_at timestamptz;
  end_at timestamptz;
  missing_day boolean;
  description_state jsonb;
BEGIN
  IF selected_at > slot_at THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_STALE_PLAN';
  END IF;
  IF private.task_recurrence_generation_list(series) IS NULL THEN
    IF clock_timestamp() >= p_expiry THEN RETURN '{"state":"expired","downtime_skipped":0}'::jsonb; END IF;
    PERFORM private.task_recurrence_scheduler_pause(series.id,'list_unavailable');
    RETURN '{"state":"failed","downtime_skipped":0}'::jsonb;
  END IF;
  LOOP
    following_date := CASE WHEN consumed + 1 >= count_limit THEN NULL
      ELSE private.task_recurrence_next_pattern(series.rule,selected_date) END;
    following_at := private.task_recurrence_local_start(following_date - series.start_offset_days,zone_name);
    EXIT WHEN selected_date >= local_date OR following_at IS NULL OR following_at > slot_at;
    skipped_count := skipped_count + 1;
    IF skipped_count >= 5000 THEN
      IF clock_timestamp() >= p_expiry THEN RETURN '{"state":"expired","downtime_skipped":0}'::jsonb; END IF;
      PERFORM private.task_recurrence_scheduler_pause(series.id,'planner_budget');
      RETURN '{"state":"failed","downtime_skipped":0}'::jsonb;
    END IF;
    skipped_through := selected_date;
    selected_date := following_date;
    selected_at := following_at;
    IF count_limit IS NOT NULL THEN consumed := consumed + 1; END IF;
  END LOOP;

  local_start_date := selected_date - series.start_offset_days;
  missing_day := (private.task_recurrence_local_start(selected_date,zone_name) AT TIME ZONE zone_name)::date <> selected_date
    OR (private.task_recurrence_local_start(local_start_date,zone_name) AT TIME ZONE zone_name)::date <> local_start_date;
  IF NOT missing_day THEN
    IF series.due_time IS NULL THEN
      start_at := private.task_recurrence_local_start(local_start_date + 1,zone_name) - interval '1 millisecond';
      end_at := private.task_recurrence_local_start(selected_date + 1,zone_name) - interval '1 millisecond';
    ELSE
      start_at := private.task_recurrence_wall_instant(local_start_date + series.due_time,zone_name);
      end_at := private.task_recurrence_wall_instant(selected_date + series.due_time,zone_name);
    END IF;

    -- Reuse only the validated document seed from an untouched occurrence of
    -- this template revision. Task IDs keep collaborative documents isolated.
    SELECT to_jsonb(task.description_yjs_state) INTO description_state
    FROM (
      SELECT task_id, series_revision, task_write_version FROM private.task_recurrence_occurrences
      WHERE series_id = series.id AND state = 'created' ORDER BY occurrence_date DESC LIMIT 1
    ) AS occurrence
    JOIN public.tasks AS task ON task.id = occurrence.task_id
    WHERE occurrence.series_revision = series.revision
      AND occurrence.task_write_version = extract(epoch FROM task.updated_at)::text
      AND task.description IS NOT DISTINCT FROM series.template->>'description'
      AND task.deleted_at IS NULL AND task.description_yjs_state IS NOT NULL;
  END IF;
  IF clock_timestamp() >= p_expiry THEN
    RETURN '{"state":"expired","downtime_skipped":0}'::jsonb;
  END IF;
  IF skipped_count > 0 THEN
    UPDATE private.task_recurrence_series SET
      cursor_date = selected_date, generate_at = selected_at,
      consumed_through = skipped_through, consumed_count = consumed, progress = progress + skipped_count
    WHERE id = series.id RETURNING * INTO series;
  END IF;
  RETURN private.task_recurrence_step(series,jsonb_build_object(
    'version',1,'date',selected_date,'next_date',following_date,'next_at',following_at,
    'start_at',start_at,'end_at',end_at,'skip',missing_day,'description_state',description_state
  ),'scheduler',NULL) || jsonb_build_object('downtime_skipped',skipped_count);
END;
$$;

CREATE FUNCTION private.task_recurrence_commit(p_slot bigint, p_batch smallint, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '8s'
AS $$
DECLARE
  control private.task_recurrence_control%ROWTYPE;
  scheduler private.task_recurrence_scheduler%ROWTYPE;
  batch_state private.task_recurrence_batches%ROWTYPE;
  slot_state private.task_recurrence_slots%ROWTYPE;
  claim private.task_recurrence_claims%ROWTYPE;
  series private.task_recurrence_series%ROWTYPE;
  workspace_gate private.task_recurrence_workspace%ROWTYPE;
  tokens uuid[];
  input_hash_value bytea;
  result_value jsonb;
  disposition text;
  created_count integer := 0;
  held_count integer := 0;
  skipped_count integer := 0;
  downtime_count integer := 0;
  stale_count integer := 0;
  expired_count integer := 0;
  failed_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'TASK_RECURRENCE_ACTOR'; END IF;
  IF p_slot IS NULL OR p_slot <= 0 OR p_slot % 900 <> 0 OR p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 5
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR octet_length(p_items::text) > 32768 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_INVALID_BATCH';
  END IF;
  IF jsonb_array_length(p_items) > 32 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object' OR (item - 'token') <> '{}'::jsonb
      OR jsonb_typeof(item->'token') IS DISTINCT FROM 'string'
      OR (item->>'token') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_INVALID_BATCH';
  END IF;
  SELECT coalesce(array_agg((item->>'token')::uuid ORDER BY (item->>'token')::uuid),ARRAY[]::uuid[])
    INTO tokens FROM jsonb_array_elements(p_items) AS item;
  input_hash_value := sha256(convert_to(to_jsonb(tokens)::text,'UTF8'));

  SELECT * INTO STRICT control FROM private.task_recurrence_control WHERE singleton FOR SHARE;
  SELECT * INTO STRICT scheduler FROM private.task_recurrence_scheduler WHERE singleton FOR UPDATE;
  SELECT * INTO batch_state FROM private.task_recurrence_batches WHERE slot = p_slot AND batch = p_batch;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','stale'); END IF;
  IF batch_state.input_hash IS NOT NULL THEN
    IF batch_state.input_hash IS DISTINCT FROM input_hash_value THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_BATCH_CONFLICT';
    END IF;
    RETURN batch_state.result;
  END IF;

  SELECT * INTO slot_state FROM private.task_recurrence_slots WHERE slot = p_slot;
  IF NOT control.request_enabled OR NOT control.scheduler_enabled OR p_slot <= control.scheduler_after_slot
    OR slot_state.global_epoch <> control.epoch THEN
    RETURN jsonb_build_object('status','stopped');
  END IF;
  IF p_slot <> scheduler.latest_slot OR slot_state.finalized THEN
    RETURN jsonb_build_object('status','stale');
  END IF;
  IF tokens IS DISTINCT FROM (
    SELECT coalesce(array_agg(token ORDER BY token),ARRAY[]::uuid[])
    FROM private.task_recurrence_claims WHERE slot = p_slot AND batch = p_batch
  ) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_BATCH_TOKENS';
  END IF;
  -- The same locks guard workspace stop and ordinary recurrence requests.
  PERFORM 1 FROM private.task_recurrence_workspace AS gate
  WHERE gate.ws_id IN (
    SELECT ws_id FROM private.task_recurrence_claims WHERE slot = p_slot AND batch = p_batch
  ) ORDER BY gate.ws_id FOR UPDATE;

  FOR claim IN SELECT * FROM private.task_recurrence_claims
    WHERE slot = p_slot AND batch = p_batch ORDER BY series_id
  LOOP
    SELECT * INTO series FROM private.task_recurrence_series WHERE id = claim.series_id AND ws_id = claim.ws_id FOR UPDATE;
    SELECT * INTO workspace_gate FROM private.task_recurrence_workspace WHERE ws_id = claim.ws_id;
    IF claim.state <> 'claimed' OR series.state IS DISTINCT FROM 'active'
      OR workspace_gate.enabled IS DISTINCT FROM true OR workspace_gate.epoch <> claim.workspace_epoch
      OR p_slot <= workspace_gate.scheduler_after_slot
      OR (series.revision,series.progress,series.cursor_date) IS DISTINCT FROM (claim.revision,claim.progress,claim.cursor_date) THEN
      disposition := 'stale';
    ELSIF clock_timestamp() >= claim.expires_at THEN
      disposition := 'expired';
    ELSIF NOT private.task_recurrence_lock_member_edit(series.ws_id,series.owner_id) THEN
      IF clock_timestamp() >= claim.expires_at THEN
        disposition := 'expired';
      ELSE
        PERFORM private.task_recurrence_scheduler_pause(series.id,'owner_ineligible');
        disposition := 'failed';
      END IF;
    ELSE
      -- Each known task-policy or plan failure rolls back its writes without
      -- losing other items. Unknown database errors roll back the whole batch.
      BEGIN
        result_value := private.task_recurrence_scheduler_step(series,p_slot,claim.expires_at);
        disposition := result_value->>'state';
        downtime_count := downtime_count + coalesce((result_value->>'downtime_skipped')::integer,0);
      EXCEPTION
        WHEN SQLSTATE 'PT409' OR SQLSTATE 'P0001' THEN
          IF SQLERRM NOT IN ('TASK_RECURRENCE_STALE_PLAN','TASK_CAPACITY_EXCEEDED','TASK_RECURRENCE_OPEN_CAPACITY')
            THEN RAISE;
          END IF;
          UPDATE private.task_recurrence_series SET
            consecutive_failures = least(5,consecutive_failures + 1), retry_after_slot = p_slot + 900
          WHERE id = series.id RETURNING * INTO series;
          IF series.consecutive_failures = 5 THEN
            PERFORM private.task_recurrence_scheduler_pause(series.id,'generation_failed');
          END IF;
          disposition := 'failed';
      END;
    END IF;
    UPDATE private.task_recurrence_claims SET state = disposition WHERE token = claim.token;
    CASE disposition
      WHEN 'created' THEN created_count := created_count + 1;
      WHEN 'held' THEN held_count := held_count + 1;
      WHEN 'skipped' THEN skipped_count := skipped_count + 1;
      WHEN 'stale' THEN stale_count := stale_count + 1;
      WHEN 'expired' THEN expired_count := expired_count + 1;
      WHEN 'failed' THEN failed_count := failed_count + 1;
      ELSE RAISE EXCEPTION 'TASK_RECURRENCE_INVALID_DISPOSITION';
    END CASE;
    IF disposition IN ('created','held','skipped') AND series.consecutive_failures > 0 THEN
      UPDATE private.task_recurrence_series SET consecutive_failures = 0, retry_after_slot = 0 WHERE id = series.id;
    END IF;
  END LOOP;
  result_value := jsonb_build_object('status','committed','created',created_count,'held',held_count,
    'skipped',skipped_count,'stale',stale_count,'expired',expired_count,'failed',failed_count,'downtime_skipped',downtime_count);
  UPDATE private.task_recurrence_batches SET input_hash = input_hash_value, result = result_value
  WHERE slot = p_slot AND batch = p_batch;
  IF p_batch = 5 OR batch_state.exhausted THEN
    UPDATE private.task_recurrence_slots SET finalized = true WHERE slot = p_slot;
  END IF;
  RETURN result_value;
END;
$$;

REVOKE ALL ON FUNCTION
  private.task_recurrence_scheduler_pause(uuid,text),
  private.task_recurrence_scheduler_step(private.task_recurrence_series,bigint,timestamptz),
  private.task_recurrence_commit(bigint,smallint,jsonb)
FROM PUBLIC, anon, authenticated, service_role, task_recurrence_operator;
GRANT EXECUTE ON FUNCTION private.task_recurrence_commit(bigint,smallint,jsonb) TO service_role;
