-- The gate setters are internal database-operator routines.
-- tuturuuu: no-grant (internal)
SET LOCAL lock_timeout = '3s';

CREATE ROLE task_recurrence_operator NOLOGIN NOINHERIT NOCREATEROLE NOCREATEDB NOBYPASSRLS;
GRANT USAGE ON SCHEMA private TO task_recurrence_operator;

CREATE TABLE private.task_recurrence_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  request_enabled boolean NOT NULL DEFAULT false,
  scheduler_enabled boolean NOT NULL DEFAULT false,
  epoch bigint NOT NULL DEFAULT 1 CHECK (epoch > 0),
  scheduler_after_slot bigint NOT NULL DEFAULT 0 CHECK (scheduler_after_slot >= 0),
  CHECK (NOT scheduler_enabled OR request_enabled)
);
INSERT INTO private.task_recurrence_control DEFAULT VALUES;

CREATE TABLE private.task_recurrence_workspace (
  ws_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  epoch bigint NOT NULL DEFAULT 1 CHECK (epoch > 0),
  scheduler_after_slot bigint NOT NULL DEFAULT 0 CHECK (scheduler_after_slot >= 0)
);
CREATE INDEX task_recurrence_enabled_workspaces_idx
ON private.task_recurrence_workspace (ws_id) WHERE enabled;

CREATE TABLE private.task_recurrence_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES public.workspace_boards(id) ON DELETE CASCADE,
  list_id uuid REFERENCES public.task_lists(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rule jsonb NOT NULL CHECK (jsonb_typeof(rule) = 'object' AND octet_length(rule::text) <= 2048),
  template jsonb NOT NULL CHECK (jsonb_typeof(template) = 'object' AND octet_length(template::text) <= 32768),
  anchor_date date NOT NULL CHECK (anchor_date BETWEEN DATE '1970-01-01' AND DATE '2999-12-31'),
  due_time time without time zone CHECK (due_time < TIME '24:00:00'),
  start_offset_days smallint NOT NULL DEFAULT 0 CHECK (start_offset_days BETWEEN 0 AND 365),
  state text NOT NULL CHECK (state IN ('active', 'paused', 'ended', 'deleted')),
  state_reason text CHECK (state_reason IN (
    'user_paused', 'list_unavailable', 'owner_ineligible', 'generation_failed', 'planner_budget', 'date_domain'
  )),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  progress bigint NOT NULL DEFAULT 0 CHECK (progress >= 0),
  cursor_date date CHECK (cursor_date BETWEEN DATE '1970-01-01' AND DATE '2999-12-31'),
  generate_at timestamptz CHECK (isfinite(generate_at)),
  consumed_through date CHECK (consumed_through BETWEEN DATE '1970-01-01' AND DATE '2999-12-31'),
  consumed_count integer NOT NULL DEFAULT 0 CHECK (consumed_count >= 0),
  consecutive_failures smallint NOT NULL DEFAULT 0 CHECK (consecutive_failures BETWEEN 0 AND 5),
  retry_after_slot bigint NOT NULL DEFAULT 0 CHECK (retry_after_slot >= 0),
  UNIQUE (id, ws_id),
  CHECK ((cursor_date IS NULL) = (generate_at IS NULL)),
  CHECK (state <> 'active' OR (cursor_date IS NOT NULL AND owner_id IS NOT NULL)),
  CHECK (consumed_through IS NULL OR cursor_date IS NULL OR cursor_date > consumed_through),
  CHECK (rule #>> '{end,type}' IS DISTINCT FROM 'count' OR consumed_count <= 1000)
);
CREATE INDEX task_recurrence_due_idx
ON private.task_recurrence_series (ws_id, generate_at, id) WHERE state = 'active';
CREATE INDEX task_recurrence_series_board_idx ON private.task_recurrence_series (board_id);
CREATE INDEX task_recurrence_series_list_idx ON private.task_recurrence_series (list_id);
CREATE INDEX task_recurrence_series_owner_idx ON private.task_recurrence_series (owner_id, ws_id);

CREATE TABLE private.task_recurrence_active_slots (
  series_id uuid PRIMARY KEY,
  ws_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  ws_slot smallint NOT NULL CHECK (ws_slot BETWEEN 1 AND 200),
  owner_slot smallint NOT NULL CHECK (owner_slot BETWEEN 1 AND 50),
  FOREIGN KEY (series_id, ws_id) REFERENCES private.task_recurrence_series(id, ws_id) ON DELETE CASCADE,
  UNIQUE (ws_id, ws_slot),
  UNIQUE (ws_id, owner_id, owner_slot)
);

CREATE TABLE private.task_recurrence_occurrences (
  series_id uuid NOT NULL,
  ws_id uuid NOT NULL,
  occurrence_date date NOT NULL CHECK (occurrence_date BETWEEN DATE '1970-01-01' AND DATE '2999-12-31'),
  task_id uuid UNIQUE REFERENCES public.tasks(id) ON DELETE SET NULL,
  task_list_id uuid,
  task_write_version text CHECK (octet_length(task_write_version) <= 128),
  open_slot smallint CHECK (open_slot BETWEEN 1 AND 3),
  state text NOT NULL CHECK (state IN ('created', 'held', 'skipped')),
  skip_reason text CHECK (skip_reason IN ('nonexistent_civil_date', 'downtime', 'pause')),
  source text NOT NULL CHECK (source IN ('create', 'completion', 'scheduler', 'resume')),
  request_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  series_revision bigint NOT NULL CHECK (series_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, occurrence_date),
  FOREIGN KEY (series_id, ws_id) REFERENCES private.task_recurrence_series(id, ws_id) ON DELETE CASCADE,
  UNIQUE (series_id, open_slot) DEFERRABLE INITIALLY DEFERRED,
  CHECK (task_id IS NOT NULL OR (open_slot IS NULL AND task_list_id IS NULL AND task_write_version IS NULL)),
  CHECK (task_id IS NULL OR (state = 'created' AND task_list_id IS NOT NULL)),
  CHECK (source <> 'scheduler' OR request_actor_id IS NULL),
  CHECK ((state = 'skipped') = (skip_reason IS NOT NULL))
);
CREATE INDEX task_recurrence_occurrence_list_idx
ON private.task_recurrence_occurrences (task_list_id, series_id) WHERE task_id IS NOT NULL;
CREATE INDEX task_recurrence_occurrence_actor_idx
ON private.task_recurrence_occurrences (request_actor_id) WHERE request_actor_id IS NOT NULL;
CREATE INDEX task_recurrence_occurrence_latest_idx
ON private.task_recurrence_occurrences (series_id, occurrence_date DESC) WHERE state = 'created';

CREATE TABLE private.task_recurrence_receipts (
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'edit', 'status', 'completion')),
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'object' AND octet_length(scope::text) <= 2048),
  input_hash bytea NOT NULL CHECK (octet_length(input_hash) = 32),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 4096),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  PRIMARY KEY (ws_id, actor_id, request_id)
);
CREATE INDEX task_recurrence_receipt_expiry_idx ON private.task_recurrence_receipts (expires_at);
CREATE INDEX task_recurrence_receipt_actor_idx ON private.task_recurrence_receipts (actor_id);

CREATE TABLE private.task_recurrence_transitions (
  transition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL UNIQUE REFERENCES public.tasks(id) ON DELETE CASCADE,
  series_id uuid NOT NULL,
  ws_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cursor_date date NOT NULL CHECK (cursor_date BETWEEN DATE '1970-01-01' AND DATE '2999-12-31'),
  revision bigint NOT NULL CHECK (revision > 0),
  progress bigint NOT NULL CHECK (progress >= 0),
  global_epoch bigint NOT NULL CHECK (global_epoch > 0),
  workspace_epoch bigint NOT NULL CHECK (workspace_epoch > 0),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  FOREIGN KEY (series_id, ws_id) REFERENCES private.task_recurrence_series(id, ws_id) ON DELETE CASCADE
);
CREATE INDEX task_recurrence_transition_expiry_idx ON private.task_recurrence_transitions (expires_at);
CREATE INDEX task_recurrence_transition_series_idx ON private.task_recurrence_transitions (series_id);
CREATE INDEX task_recurrence_transition_actor_idx ON private.task_recurrence_transitions (actor_id);

CREATE TABLE private.task_recurrence_scheduler (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  latest_slot bigint NOT NULL DEFAULT 0 CHECK (latest_slot >= 0),
  seek_ws_id uuid,
  seek_at timestamptz,
  seek_id uuid,
  CHECK ((seek_at IS NULL) = (seek_id IS NULL)),
  CHECK (seek_at IS NULL OR seek_ws_id IS NOT NULL)
);
INSERT INTO private.task_recurrence_scheduler DEFAULT VALUES;

CREATE TABLE private.task_recurrence_slots (
  slot bigint PRIMARY KEY CHECK (slot >= 0 AND slot % 900 = 0),
  global_epoch bigint NOT NULL CHECK (global_epoch > 0),
  reserved smallint NOT NULL DEFAULT 0 CHECK (reserved BETWEEN 0 AND 160),
  finalized boolean NOT NULL DEFAULT false
);

CREATE TABLE private.task_recurrence_slot_workspaces (
  slot bigint NOT NULL REFERENCES private.task_recurrence_slots(slot) ON DELETE CASCADE,
  ws_id uuid NOT NULL,
  reserved smallint NOT NULL CHECK (reserved BETWEEN 1 AND 32),
  PRIMARY KEY (slot, ws_id)
);

CREATE TABLE private.task_recurrence_batches (
  slot bigint NOT NULL REFERENCES private.task_recurrence_slots(slot) ON DELETE CASCADE,
  batch smallint NOT NULL CHECK (batch BETWEEN 1 AND 5),
  examined smallint NOT NULL CHECK (examined BETWEEN 0 AND 128),
  exhausted boolean NOT NULL,
  input_hash bytea CHECK (octet_length(input_hash) = 32),
  result jsonb CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 1024),
  PRIMARY KEY (slot, batch),
  CHECK ((input_hash IS NULL) = (result IS NULL))
);

CREATE TABLE private.task_recurrence_claims (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot bigint NOT NULL,
  batch smallint NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 32),
  series_id uuid NOT NULL,
  ws_id uuid NOT NULL,
  cursor_date date NOT NULL CHECK (cursor_date BETWEEN DATE '1970-01-01' AND DATE '2999-12-31'),
  revision bigint NOT NULL CHECK (revision > 0),
  progress bigint NOT NULL CHECK (progress >= 0),
  workspace_epoch bigint NOT NULL CHECK (workspace_epoch > 0),
  planned_at timestamptz NOT NULL CHECK (isfinite(planned_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at > planned_at),
  state text NOT NULL DEFAULT 'claimed' CHECK (state IN (
    'claimed', 'created', 'held', 'skipped', 'ended', 'failed', 'expired', 'stale'
  )),
  FOREIGN KEY (slot, batch) REFERENCES private.task_recurrence_batches(slot, batch) ON DELETE CASCADE,
  UNIQUE (slot, batch, position),
  UNIQUE (slot, series_id)
);
CREATE UNIQUE INDEX task_recurrence_one_claim_idx
ON private.task_recurrence_claims (series_id) WHERE state = 'claimed';
CREATE INDEX task_recurrence_claim_expiry_idx
ON private.task_recurrence_claims (expires_at) WHERE state = 'claimed';

ALTER TABLE private.task_recurrence_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_active_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_scheduler ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_slot_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.task_recurrence_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  private.task_recurrence_control, private.task_recurrence_workspace, private.task_recurrence_series,
  private.task_recurrence_active_slots, private.task_recurrence_occurrences, private.task_recurrence_receipts,
  private.task_recurrence_transitions, private.task_recurrence_scheduler, private.task_recurrence_slots,
  private.task_recurrence_slot_workspaces, private.task_recurrence_batches, private.task_recurrence_claims
FROM PUBLIC, anon, authenticated, service_role, task_recurrence_operator;

CREATE FUNCTION private.task_recurrence_set_control(
  p_request_enabled boolean, p_scheduler_enabled boolean, p_expected_epoch bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  control private.task_recurrence_control%ROWTYPE;
  matches boolean;
BEGIN
  IF p_request_enabled IS NULL OR p_scheduler_enabled IS NULL
    OR (p_scheduler_enabled AND NOT p_request_enabled)
    OR p_expected_epoch IS NULL OR p_expected_epoch < 1 THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_INVALID_CONTROL' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT control FROM private.task_recurrence_control WHERE singleton FOR UPDATE;
  matches := control.epoch = p_expected_epoch;
  IF matches AND (control.request_enabled, control.scheduler_enabled)
    IS DISTINCT FROM (p_request_enabled, p_scheduler_enabled) THEN
    UPDATE private.task_recurrence_control
    SET request_enabled = p_request_enabled,
        scheduler_enabled = p_scheduler_enabled,
        epoch = epoch + 1,
        scheduler_after_slot = floor(extract(epoch FROM clock_timestamp()) / 900)::bigint * 900
    WHERE singleton RETURNING * INTO control;
  END IF;
  RETURN jsonb_build_object('applied', matches, 'epoch', control.epoch,
    'request_enabled', control.request_enabled, 'scheduler_enabled', control.scheduler_enabled,
    'scheduler_after_slot', control.scheduler_after_slot);
END;
$$;

CREATE FUNCTION private.task_recurrence_set_workspace(
  p_ws uuid, p_enabled boolean, p_expected_epoch bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  gate private.task_recurrence_workspace%ROWTYPE;
  matches boolean;
BEGIN
  IF p_ws IS NULL OR p_enabled IS NULL OR p_expected_epoch IS NULL OR p_expected_epoch < 0 THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_INVALID_WORKSPACE_GATE' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM private.task_recurrence_control WHERE singleton FOR SHARE;
  SELECT * INTO gate FROM private.task_recurrence_workspace WHERE ws_id = p_ws FOR UPDATE;
  IF NOT FOUND THEN
    -- Serialize first insertion without holding the parent while waiting for
    -- an existing gate. Completion locks the gate before workspace identity.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_ws::text, 362527));
    SELECT * INTO gate FROM private.task_recurrence_workspace WHERE ws_id = p_ws FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM 1 FROM public.workspaces WHERE id = p_ws FOR NO KEY UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TASK_RECURRENCE_WORKSPACE_MISSING' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;
  matches := coalesce(gate.epoch, 0) = p_expected_epoch;
  IF matches AND coalesce(gate.enabled, false) IS DISTINCT FROM p_enabled THEN
    INSERT INTO private.task_recurrence_workspace (ws_id, enabled, epoch, scheduler_after_slot)
    VALUES (p_ws, p_enabled, 1, floor(extract(epoch FROM clock_timestamp()) / 900)::bigint * 900)
    ON CONFLICT (ws_id) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          epoch = task_recurrence_workspace.epoch + 1,
          scheduler_after_slot = EXCLUDED.scheduler_after_slot
    RETURNING * INTO gate;
  END IF;
  RETURN jsonb_build_object('applied', matches, 'epoch', coalesce(gate.epoch, 0),
    'enabled', coalesce(gate.enabled, false), 'scheduler_after_slot', coalesce(gate.scheduler_after_slot, 0));
END;
$$;

CREATE FUNCTION private.task_recurrence_disable_control(p_expected_epoch bigint)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
  SELECT private.task_recurrence_set_control(false, false, p_expected_epoch);
$$;

CREATE FUNCTION private.task_recurrence_disable_workspace(p_ws uuid, p_expected_epoch bigint)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
AS $$
  SELECT private.task_recurrence_set_workspace(p_ws, false, p_expected_epoch);
$$;

CREATE FUNCTION private.task_recurrence_probe(p_slot bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '8s'
AS $$
DECLARE
  control private.task_recurrence_control%ROWTYPE;
  sampled integer;
  due integer;
BEGIN
  IF p_slot IS NULL OR p_slot <= 0 OR p_slot % 900 <> 0
    OR p_slot > extract(epoch FROM statement_timestamp()) THEN
    RAISE EXCEPTION 'TASK_RECURRENCE_INVALID_SLOT' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT control FROM private.task_recurrence_control WHERE singleton;
  WITH workspace_sample AS MATERIALIZED (
    SELECT ws_id FROM private.task_recurrence_workspace
    WHERE enabled AND scheduler_after_slot < p_slot
    ORDER BY ws_id LIMIT 128
  )
  SELECT count(*)::integer, count(candidate.id)::integer INTO sampled, due
  FROM workspace_sample
  LEFT JOIN LATERAL (
    SELECT series.id FROM private.task_recurrence_series AS series
    WHERE series.ws_id = workspace_sample.ws_id AND series.state = 'active'
      AND series.generate_at <= to_timestamp(p_slot)
    ORDER BY series.generate_at, series.id LIMIT 1
  ) AS candidate ON true;
  RETURN jsonb_build_object('epoch', control.epoch, 'request_enabled', control.request_enabled,
    'scheduler_enabled', control.scheduler_enabled AND control.scheduler_after_slot < p_slot,
    'workspaces_sampled', sampled, 'workspaces_with_due_series', due);
END;
$$;

REVOKE ALL ON FUNCTION
  private.task_recurrence_set_control(boolean, boolean, bigint),
  private.task_recurrence_set_workspace(uuid, boolean, bigint),
  private.task_recurrence_disable_control(bigint),
  private.task_recurrence_disable_workspace(uuid, bigint),
  private.task_recurrence_probe(bigint)
FROM PUBLIC, anon, authenticated, service_role, task_recurrence_operator;
GRANT EXECUTE ON FUNCTION
  private.task_recurrence_set_control(boolean, boolean, bigint),
  private.task_recurrence_set_workspace(uuid, boolean, bigint)
TO task_recurrence_operator;
GRANT EXECUTE ON FUNCTION
  private.task_recurrence_disable_control(bigint),
  private.task_recurrence_disable_workspace(uuid, bigint),
  private.task_recurrence_probe(bigint)
TO service_role;
