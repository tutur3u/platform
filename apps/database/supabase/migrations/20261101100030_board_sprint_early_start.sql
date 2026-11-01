-- Starting a board sprint before its planned Monday used to pull only the
-- start date back, so a two-week sprint started on a Wednesday ran until its
-- planned end two and a half weeks later (or longer when the previous sprint
-- ended early). A sprint now keeps its length: it starts today and ends on the
-- Friday of its last week, and the next sprint is planned after that end.
-- Weekend starts count from the following Monday.

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

REVOKE ALL ON FUNCTION public.start_board_sprint(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_board_sprint(UUID, UUID) TO service_role;
