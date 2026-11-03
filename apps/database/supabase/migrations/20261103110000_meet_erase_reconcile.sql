-- Admission bookkeeping only. No restore, replay or release is scheduled here.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE private.meet_restore_quarantines (
  id uuid PRIMARY KEY,
  admitted boolean NOT NULL DEFAULT false,
  ledger_seq bigint NOT NULL CHECK (ledger_seq >= 0),
  ledger_mac text NOT NULL CHECK (ledger_mac ~ '^[0-9a-f]{64}$'),
  holds_installed boolean NOT NULL DEFAULT false,
  pending_hold_transition boolean NOT NULL DEFAULT true
);
CREATE TABLE private.meet_restore_intents (
  quarantine_id uuid NOT NULL REFERENCES private.meet_restore_quarantines(id),
  operation_key uuid NOT NULL,
  ws_id uuid NOT NULL,
  meeting_id uuid NOT NULL,
  plan_hash text NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  ledger_seq bigint NOT NULL CHECK (ledger_seq > 0),
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','reconciled')),
  PRIMARY KEY (quarantine_id, operation_key)
);
ALTER TABLE private.meet_restore_quarantines ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.meet_restore_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.meet_restore_quarantines, private.meet_restore_intents FROM PUBLIC, anon, authenticated, service_role;
-- Only the database owner admits a separately reviewed restore. No runtime
-- principal can enable quarantine or certify the independently rebuilt holds.
CREATE FUNCTION public.reconcile_meet_erasure_intent(
  p_quarantine_id uuid, p_ws_id uuid, p_meeting_id uuid,
  p_operation_key uuid, p_plan_hash text, p_ledger_seq bigint,
  p_head_seq bigint, p_head_mac text, p_protected_workspace_ids uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET lock_timeout = '3s' SET statement_timeout = '10s'
AS $$
DECLARE q private.meet_restore_quarantines; old private.meet_restore_intents;
BEGIN
  -- EC first, before any protected lookup. No real customer id is in source.
  IF coalesce(cardinality(p_protected_workspace_ids), 0) = 0
    OR p_ws_id IS NULL OR p_ws_id = ANY(p_protected_workspace_ids)
    OR array_position(p_protected_workspace_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'MEET_ERASE_SCOPE_DENIED';
  END IF;
  SELECT * INTO q FROM private.meet_restore_quarantines
    WHERE id = p_quarantine_id FOR UPDATE;
  IF NOT FOUND OR NOT q.admitted OR NOT q.holds_installed
    OR q.pending_hold_transition OR q.ledger_seq IS DISTINCT FROM p_head_seq
    OR q.ledger_mac IS DISTINCT FROM p_head_mac THEN
    RAISE EXCEPTION 'MEET_RESTORE_QUARANTINE_REQUIRED';
  END IF;
  IF p_ledger_seq IS NULL OR p_ledger_seq <= 0 OR p_ledger_seq > q.ledger_seq THEN
    RAISE EXCEPTION 'MEET_RESTORE_LEDGER_INVALID';
  END IF;
  -- V4 must exist before invocation. Never relabel installed document bytes.
  UPDATE private.meet_content_fences SET restore_hold = true
    WHERE ws_id = p_ws_id AND meeting_id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEET_RESTORE_FENCE_REQUIRED'; END IF;
  SELECT * INTO old FROM private.meet_restore_intents
    WHERE quarantine_id = p_quarantine_id AND operation_key = p_operation_key;
  IF FOUND THEN
    IF old.ws_id IS DISTINCT FROM p_ws_id OR old.meeting_id IS DISTINCT FROM p_meeting_id
      OR old.plan_hash IS DISTINCT FROM p_plan_hash OR old.ledger_seq IS DISTINCT FROM p_ledger_seq THEN
      RAISE EXCEPTION 'MEET_RESTORE_KEY_CONFLICT';
    END IF;
    RETURN;
  END IF;
  INSERT INTO private.meet_restore_intents(quarantine_id,operation_key,ws_id,meeting_id,plan_hash,ledger_seq)
    VALUES (p_quarantine_id,p_operation_key,p_ws_id,p_meeting_id,p_plan_hash,p_ledger_seq);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_meet_erasure_intent(uuid,uuid,uuid,uuid,text,bigint,bigint,text,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_meet_erasure_intent(uuid,uuid,uuid,uuid,text,bigint,bigint,text,uuid[]) TO service_role;
COMMIT;
