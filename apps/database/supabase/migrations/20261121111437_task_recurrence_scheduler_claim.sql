SET LOCAL lock_timeout = '3s';

CREATE FUNCTION private.task_recurrence_claim(p_slot bigint, p_batch smallint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '8s'
AS $$
DECLARE
  control private.task_recurrence_control%ROWTYPE;
  scheduler private.task_recurrence_scheduler%ROWTYPE;
  slot_state private.task_recurrence_slots%ROWTYPE;
  batch_state private.task_recurrence_batches%ROWTYPE;
  candidate private.task_recurrence_series%ROWTYPE;
  workspace_gate private.task_recurrence_workspace%ROWTYPE;
  empty_workspaces uuid[] := ARRAY[]::uuid[];
  ws_seek uuid;
  claims jsonb;
  batch_examined integer := 0;
  batch_reserved integer := 0;
  batch_exhausted boolean := false;
  saw_busy_gate boolean := false;
  observed_at timestamptz;
  expires_at timestamptz;
  prior_slot bigint;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'TASK_RECURRENCE_ACTOR'; END IF;
  IF p_slot IS NULL OR p_slot <= 0 OR p_slot % 900 <> 0 OR p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 5 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'TASK_RECURRENCE_INVALID_BATCH';
  END IF;
  SELECT * INTO STRICT control FROM private.task_recurrence_control WHERE singleton FOR SHARE;
  IF NOT control.request_enabled OR NOT control.scheduler_enabled OR p_slot <= control.scheduler_after_slot THEN
    RETURN jsonb_build_object('status','stopped');
  END IF;

  -- One admission lock serializes duplicate workers, batch order and the slot
  -- watermark. Admission takes nonblocking workspace share locks; commit
  -- holds the workspace gate exclusively through task and fan-out writes.
  SELECT * INTO STRICT scheduler FROM private.task_recurrence_scheduler WHERE singleton FOR UPDATE;
  observed_at := clock_timestamp();
  IF p_slot <> floor(extract(epoch FROM observed_at) / 900)::bigint * 900 OR p_slot < scheduler.latest_slot THEN
    RETURN jsonb_build_object('status','stale');
  END IF;
  SELECT * INTO slot_state FROM private.task_recurrence_slots WHERE slot = p_slot;
  IF slot_state.slot IS NOT NULL AND slot_state.global_epoch <> control.epoch THEN
    RETURN jsonb_build_object('status','stale');
  END IF;

  SELECT * INTO batch_state FROM private.task_recurrence_batches WHERE slot = p_slot AND batch = p_batch;
  IF FOUND THEN
    SELECT coalesce(jsonb_agg(token ORDER BY position),'[]'::jsonb) INTO claims
    FROM private.task_recurrence_claims WHERE slot = p_slot AND batch = p_batch;
    RETURN jsonb_build_object('status','claimed','tokens',claims,
      'examined',batch_state.examined,'exhausted',batch_state.exhausted);
  END IF;
  IF slot_state.finalized THEN RETURN jsonb_build_object('status','finalized'); END IF;
  IF p_batch > 1 AND NOT EXISTS (
    SELECT 1 FROM private.task_recurrence_batches WHERE slot = p_slot AND batch = p_batch - 1 AND result IS NOT NULL
  ) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_BATCH_ORDER';
  END IF;

  IF p_slot > scheduler.latest_slot THEN
    IF p_batch <> 1 THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'TASK_RECURRENCE_BATCH_ORDER'; END IF;
    prior_slot := scheduler.latest_slot;
    -- The previous admitted slot contains at most 160 tokens. A lost or
    -- interrupted Worker leaves terminal expired records for reconciliation.
    UPDATE private.task_recurrence_claims SET state = 'expired' WHERE slot = prior_slot AND state = 'claimed';
    UPDATE private.task_recurrence_slots SET finalized = true WHERE slot = prior_slot AND NOT finalized;
    -- Prune at most one expired replay slot per new slot, with bounded cascade.
    DELETE FROM private.task_recurrence_slots WHERE slot = (
      SELECT slot FROM private.task_recurrence_slots
      WHERE slot < p_slot - 604800 ORDER BY slot LIMIT 1
    );
    INSERT INTO private.task_recurrence_slots (slot, global_epoch) VALUES (p_slot, control.epoch);
    UPDATE private.task_recurrence_scheduler SET latest_slot = p_slot WHERE singleton;
  END IF;

  INSERT INTO private.task_recurrence_batches (slot, batch, examined, exhausted)
    VALUES (p_slot,p_batch,0,false);
  ws_seek := scheduler.seek_ws_id;
  expires_at := least(observed_at + interval '180 seconds', to_timestamp(p_slot + 900));

  WHILE batch_examined < 128 AND batch_reserved < 32 LOOP
    -- Two index range scans implement wraparound without sorting all enabled
    -- tenants. Empty and capped workspaces are visited once per batch.
    IF ws_seek IS NULL THEN
      SELECT * INTO workspace_gate FROM private.task_recurrence_workspace
      WHERE enabled ORDER BY ws_id LIMIT 1;
    ELSE
      SELECT * INTO workspace_gate FROM private.task_recurrence_workspace
      WHERE enabled AND ws_id > ws_seek AND NOT (ws_id = ANY(empty_workspaces))
      ORDER BY ws_id LIMIT 1;
      IF NOT FOUND THEN
        SELECT * INTO workspace_gate FROM private.task_recurrence_workspace
        WHERE enabled AND ws_id <= ws_seek AND NOT (ws_id = ANY(empty_workspaces))
        ORDER BY ws_id LIMIT 1;
      END IF;
    END IF;
    IF workspace_gate.ws_id IS NULL THEN
      batch_exhausted := NOT saw_busy_gate;
      EXIT;
    END IF;
    ws_seek := workspace_gate.ws_id;
    batch_examined := batch_examined + 1;
    IF workspace_gate.scheduler_after_slot >= p_slot OR EXISTS (
      SELECT 1 FROM private.task_recurrence_slot_workspaces
      WHERE slot = p_slot AND ws_id = workspace_gate.ws_id AND task_recurrence_slot_workspaces.reserved = 32
    ) THEN
      empty_workspaces := array_append(empty_workspaces, ws_seek);
      CONTINUE;
    END IF;
    -- The workspace slot constraint bounds active series to 200. One visit
    -- selects at most one eligible series before rotating to the next tenant.
    SELECT * INTO candidate FROM private.task_recurrence_series AS series
    WHERE series.ws_id = ws_seek AND series.state = 'active' AND series.generate_at <= to_timestamp(p_slot)
      AND series.retry_after_slot <= p_slot
      AND NOT EXISTS (SELECT 1 FROM private.task_recurrence_claims AS claim
        WHERE claim.slot = p_slot AND claim.series_id = series.id)
      AND NOT EXISTS (SELECT 1 FROM private.task_recurrence_claims AS claim
        WHERE claim.series_id = series.id AND claim.state = 'claimed')
    ORDER BY series.generate_at, series.id LIMIT 1;
    IF NOT FOUND THEN
      empty_workspaces := array_append(empty_workspaces, ws_seek);
      CONTINUE;
    END IF;

    -- Never wait on a workspace while holding the scheduler or prior-token
    -- locks. A busy workspace stays in the rotation for the next batch.
    SELECT * INTO workspace_gate FROM private.task_recurrence_workspace
    WHERE ws_id = ws_seek AND enabled AND scheduler_after_slot < p_slot
    FOR SHARE SKIP LOCKED;
    IF NOT FOUND THEN
      saw_busy_gate := true;
      empty_workspaces := array_append(empty_workspaces, ws_seek);
      CONTINUE;
    END IF;
    SELECT * INTO candidate FROM private.task_recurrence_series
    WHERE id = candidate.id AND ws_id = ws_seek AND state = 'active'
      AND generate_at <= to_timestamp(p_slot) AND retry_after_slot <= p_slot;
    IF NOT FOUND THEN
      empty_workspaces := array_append(empty_workspaces, ws_seek);
      CONTINUE;
    END IF;
    batch_reserved := batch_reserved + 1;
    INSERT INTO private.task_recurrence_claims (
      slot,batch,position,series_id,ws_id,cursor_date,revision,progress,workspace_epoch,planned_at,expires_at
    ) VALUES (
      p_slot,p_batch,batch_reserved,candidate.id,candidate.ws_id,candidate.cursor_date,candidate.revision,
      candidate.progress,workspace_gate.epoch,observed_at,expires_at
    );
    INSERT INTO private.task_recurrence_slot_workspaces AS usage (slot,ws_id,reserved)
    VALUES (p_slot,candidate.ws_id,1)
    ON CONFLICT (slot,ws_id) DO UPDATE SET reserved = usage.reserved + 1;
  END LOOP;

  UPDATE private.task_recurrence_scheduler SET seek_ws_id = ws_seek WHERE singleton;
  UPDATE private.task_recurrence_slots AS admission
    SET reserved = admission.reserved + batch_reserved,
        finalized = CASE WHEN batch_reserved = 0 THEN batch_exhausted OR p_batch = 5 ELSE false END
    WHERE admission.slot = p_slot;
  UPDATE private.task_recurrence_batches AS batch_row SET
    examined = batch_examined, exhausted = batch_exhausted,
    input_hash = CASE WHEN batch_reserved = 0 THEN sha256(convert_to('[]','UTF8')) END,
    result = CASE WHEN batch_reserved = 0 THEN '{"status":"committed","created":0,"failed":0,"held":0,"skipped":0,"stale":0,"expired":0,"downtime_skipped":0}'::jsonb END
  WHERE batch_row.slot = p_slot AND batch_row.batch = p_batch;
  SELECT coalesce(jsonb_agg(token ORDER BY position),'[]'::jsonb) INTO claims
  FROM private.task_recurrence_claims WHERE slot = p_slot AND batch = p_batch;
  RETURN jsonb_build_object('status','claimed','tokens',claims,'examined',batch_examined,'exhausted',batch_exhausted);
END;
$$;

REVOKE ALL ON FUNCTION private.task_recurrence_claim(bigint, smallint)
FROM PUBLIC, anon, authenticated, service_role, task_recurrence_operator;
GRANT EXECUTE ON FUNCTION private.task_recurrence_claim(bigint, smallint) TO service_role;
