-- Manual rollback only: restores the 20261029060000 start_board_sprint, which
-- pulls only the start date back when a sprint starts early. Run the
-- 20261029060060 rollback first (it restores this migration's version), then
-- this one. No data changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.start_board_sprint(
  p_cycle_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS public.task_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_cycle public.task_cycles%ROWTYPE;
BEGIN
  SELECT * INTO v_cycle
  FROM public.task_cycles
  WHERE id = p_cycle_id AND board_id IS NOT NULL AND deleted IS NOT TRUE
  FOR UPDATE;

  IF v_cycle.id IS NULL THEN
    RAISE EXCEPTION 'SPRINT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_cycle.status = 'active' THEN
    RETURN v_cycle;
  END IF;

  IF v_cycle.status <> 'planned' THEN
    RAISE EXCEPTION 'SPRINT_NOT_PLANNED' USING ERRCODE = '55000';
  END IF;

  -- Serialize sprint changes per board.
  PERFORM 1 FROM public.workspace_boards WHERE id = v_cycle.board_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.task_cycles
    WHERE board_id = v_cycle.board_id
      AND status = 'active'
      AND deleted IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'SPRINT_ALREADY_ACTIVE' USING ERRCODE = '55000';
  END IF;

  UPDATE public.task_cycles
  SET status = 'active',
      started_at = now(),
      start_date = LEAST(start_date, CURRENT_DATE),
      updated_at = now()
  WHERE id = v_cycle.id
  RETURNING * INTO v_cycle;

  PERFORM private.create_planned_board_sprint(
    v_cycle.board_id,
    v_cycle.end_date,
    p_actor_id
  );

  RETURN v_cycle;
END;
$$;


REVOKE ALL ON FUNCTION public.start_board_sprint(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_board_sprint(UUID, UUID) TO service_role;

COMMIT;
