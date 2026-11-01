-- Manual rollback only: returns boards to one planned sprint each. Drops the
-- add/remove sprint and parked-task RPCs, restores the 20261101100000 sprint
-- length change and the 20261101100030 sprint start, and restores the
-- one-planned-sprint index. Run the 20261101100070 rollback first, deploy app
-- code that no longer calls the dropped RPCs, and remove every extra planned
-- sprint (keep the earliest) before running: the index refuses otherwise.
-- Tasks parked outside every sprint stay parked until they next change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed read-only guard query, no EXECUTE or input.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.task_cycles
    WHERE board_id IS NOT NULL AND status = 'planned' AND deleted IS NOT TRUE
    GROUP BY board_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'boards with more than one planned sprint exist; remove the later ones first';
  END IF;
END;
$guard$;

DROP FUNCTION public.add_board_sprint(UUID, UUID, UUID);
DROP FUNCTION public.remove_board_sprint(UUID, UUID, UUID, UUID);
DROP FUNCTION public.list_board_unplanned_task_ids(UUID, UUID);

CREATE OR REPLACE FUNCTION public.set_board_sprint_length(
  p_board_id UUID,
  p_weeks SMALLINT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS public.task_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_active public.task_cycles%ROWTYPE;
  v_planned public.task_cycles%ROWTYPE;
BEGIN
  IF p_weeks IS NOT NULL AND p_weeks NOT IN (1, 2) THEN
    RAISE EXCEPTION 'SPRINT_LENGTH_INVALID' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_boards
  SET sprint_length_weeks = p_weeks
  WHERE id = p_board_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOARD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_weeks IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_active
  FROM public.task_cycles
  WHERE board_id = p_board_id AND status = 'active' AND deleted IS NOT TRUE
  FOR UPDATE;

  SELECT * INTO v_planned
  FROM public.task_cycles
  WHERE board_id = p_board_id AND status = 'planned' AND deleted IS NOT TRUE
  FOR UPDATE;

  IF v_planned.id IS NULL THEN
    v_planned := private.create_planned_board_sprint(
      p_board_id,
      v_active.end_date,
      p_actor_id
    );
  ELSE
    UPDATE public.task_cycles
    SET end_date = private.board_sprint_end_date(start_date, p_weeks),
        updated_at = now()
    WHERE id = v_planned.id
    RETURNING * INTO v_planned;
  END IF;

  -- Open tasks that are not in a sprint yet join the sprint being planned, so
  -- turning sprints on shows the board's work in Plan.
  INSERT INTO public.task_cycle_tasks (task_id, cycle_id)
  SELECT t.id, v_planned.id
  FROM public.tasks t
  WHERE t.board_id = p_board_id
    AND t.deleted_at IS NULL
    AND t.completed_at IS NULL
    AND t.closed_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.task_cycle_tasks tct
      JOIN public.task_cycles c ON c.id = tct.cycle_id
      WHERE tct.task_id = t.id
        AND c.board_id = p_board_id
        AND c.status IN ('planned', 'active')
        AND c.deleted IS NOT TRUE
    )
  ON CONFLICT (task_id, cycle_id) DO NOTHING;

  RETURN v_planned;
END;
$$;

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
  v_weeks INTEGER;
  v_start DATE;
  v_end DATE;
BEGIN
  -- Lock order for every sprint writer: the board row first, then cycles.
  -- Task membership writes hold the board row FOR SHARE, so taking the cycle
  -- first could deadlock with them.
  PERFORM 1
  FROM public.workspace_boards wb
  JOIN public.task_cycles c ON c.board_id = wb.id
  WHERE c.id = p_cycle_id
  FOR UPDATE OF wb;

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

  IF EXISTS (
    SELECT 1
    FROM public.task_cycles
    WHERE board_id = v_cycle.board_id
      AND status = 'active'
      AND deleted IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'SPRINT_ALREADY_ACTIVE' USING ERRCODE = '55000';
  END IF;

  v_start := v_cycle.start_date;
  v_end := v_cycle.end_date;

  IF v_start IS NULL OR v_end IS NULL OR CURRENT_DATE < v_start THEN
    -- Planned sprints run Monday to Friday, so (end - start + 3) / 7 is the
    -- length in weeks.
    v_weeks := GREATEST(
      1,
      COALESCE((v_end - v_start + 3) / 7, 0)
    );
    v_start := CURRENT_DATE;
    -- Monday of this week, or of next week on a weekend.
    v_end := date_trunc('week', CURRENT_DATE + 2)::date + v_weeks * 7 - 3;
  END IF;

  UPDATE public.task_cycles
  SET status = 'active',
      started_at = now(),
      start_date = v_start,
      end_date = v_end,
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

REVOKE ALL ON FUNCTION public.set_board_sprint_length(UUID, SMALLINT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_board_sprint(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_board_sprint_length(UUID, SMALLINT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_board_sprint(UUID, UUID) TO service_role;

-- The restored functions no longer call it.
DROP FUNCTION private.rechain_planned_board_sprints(UUID);

CREATE UNIQUE INDEX task_cycles_one_planned_per_board
  ON public.task_cycles (board_id)
  WHERE board_id IS NOT NULL AND status = 'planned' AND deleted IS NOT TRUE;

NOTIFY pgrst, 'reload schema';
COMMIT;
