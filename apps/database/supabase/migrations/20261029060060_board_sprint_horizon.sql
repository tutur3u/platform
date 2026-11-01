-- Board sprints: planning several sprints ahead. A board keeps up to five open
-- sprints, the running one and the planned ones after it. Planned sprints chain
-- one after another, and only the earliest one, the next sprint, can start
-- (20261029060070_board_sprint_next_first.sql sends carried and rejoining work
-- to it). A task can also sit in no sprint, parked in Plan's backlog until
-- someone plans it. Builds on 20261029060000_board_sprints.sql through
-- 20261029060030_board_sprint_early_start.sql.

-- 1. More than one planned sprint per board.
DROP INDEX IF EXISTS public.task_cycles_one_planned_per_board;

-- 2. Planned sprints follow each other.

CREATE OR REPLACE FUNCTION private.rechain_planned_board_sprints(p_board_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_weeks INTEGER;
  v_prev_end DATE;
  v_cycle RECORD;
  v_start DATE;
BEGIN
  SELECT COALESCE(sprint_length_weeks, 2)
  INTO v_weeks
  FROM public.workspace_boards
  WHERE id = p_board_id;

  SELECT end_date
  INTO v_prev_end
  FROM public.task_cycles
  WHERE board_id = p_board_id AND status = 'active' AND deleted IS NOT TRUE;

  FOR v_cycle IN
    SELECT id, start_date
    FROM public.task_cycles
    WHERE board_id = p_board_id AND status = 'planned' AND deleted IS NOT TRUE
    ORDER BY sequence_number
  LOOP
    v_start := CASE
      WHEN v_prev_end IS NOT NULL
        THEN private.board_sprint_next_monday(v_prev_end + 1)
      ELSE COALESCE(
        v_cycle.start_date,
        private.board_sprint_next_monday(CURRENT_DATE)
      )
    END;
    v_prev_end := private.board_sprint_end_date(v_start, v_weeks);

    UPDATE public.task_cycles
    SET start_date = v_start,
        end_date = v_prev_end,
        updated_at = now()
    WHERE id = v_cycle.id
      AND (start_date IS DISTINCT FROM v_start OR end_date IS DISTINCT FROM v_prev_end);
  END LOOP;
END;
$$;

-- tuturuuu: no-grant (internal)
REVOKE ALL ON FUNCTION private.rechain_planned_board_sprints(UUID) FROM PUBLIC, anon, authenticated;

-- 3. A length change moves every planned sprint, and only turning sprints on
-- sweeps open tasks into the next sprint, so parked tasks stay parked.
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
  v_was_on BOOLEAN;
BEGIN
  IF p_weeks IS NOT NULL AND p_weeks NOT IN (1, 2) THEN
    RAISE EXCEPTION 'SPRINT_LENGTH_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT sprint_length_weeks IS NOT NULL
  INTO v_was_on
  FROM public.workspace_boards
  WHERE id = p_board_id
  FOR UPDATE;

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

  -- The next sprint to start: the earliest planned one.
  SELECT * INTO v_planned
  FROM public.task_cycles
  WHERE board_id = p_board_id AND status = 'planned' AND deleted IS NOT TRUE
  ORDER BY sequence_number
  LIMIT 1
  FOR UPDATE;

  IF v_planned.id IS NULL THEN
    v_planned := private.create_planned_board_sprint(
      p_board_id,
      v_active.end_date,
      p_actor_id
    );
  END IF;
  -- A new length moves every planned sprint's dates.
  PERFORM private.rechain_planned_board_sprints(p_board_id);
  SELECT * INTO v_planned FROM public.task_cycles WHERE id = v_planned.id;

  -- Turning sprints on puts open tasks that are not in a sprint yet in the
  -- sprint being planned, so Plan shows the board's work. A length change
  -- leaves tasks parked outside every sprint where they are.
  IF NOT COALESCE(v_was_on, FALSE) THEN
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
  END IF;

  RETURN v_planned;
END;
$$;

-- 4. Only the earliest planned sprint starts; later ones move to follow it.
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

  -- Planned sprints start in order: only the earliest one is next.
  IF EXISTS (
    SELECT 1
    FROM public.task_cycles
    WHERE board_id = v_cycle.board_id
      AND status = 'planned'
      AND deleted IS NOT TRUE
      AND sequence_number < v_cycle.sequence_number
  ) THEN
    RAISE EXCEPTION 'SPRINT_NOT_NEXT' USING ERRCODE = '55000';
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

  -- Keep a next sprint, and move the planned ones after this sprint's end.
  IF NOT EXISTS (
    SELECT 1
    FROM public.task_cycles
    WHERE board_id = v_cycle.board_id
      AND status = 'planned'
      AND deleted IS NOT TRUE
  ) THEN
    PERFORM private.create_planned_board_sprint(
      v_cycle.board_id,
      v_cycle.end_date,
      p_actor_id
    );
  END IF;
  PERFORM private.rechain_planned_board_sprints(v_cycle.board_id);

  RETURN v_cycle;
END;
$$;

-- 5. Planning further ahead. A board keeps up to five open sprints: the
-- running one and the planned ones after it. A new sprint follows the last.
-- These three take the route's workspace and board, and refuse ids from any
-- other workspace or board even though only the service role can call them.
CREATE OR REPLACE FUNCTION public.add_board_sprint(
  p_ws_id UUID,
  p_board_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS public.task_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_weeks SMALLINT;
  v_open INTEGER;
  v_last_end DATE;
BEGIN
  -- Board row first, like every sprint writer.
  SELECT sprint_length_weeks INTO v_weeks
  FROM public.workspace_boards
  WHERE id = p_board_id AND ws_id = p_ws_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SPRINT_BOARD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_weeks IS NULL THEN
    RAISE EXCEPTION 'SPRINTS_OFF' USING ERRCODE = '55000';
  END IF;

  SELECT COUNT(*), MAX(end_date)
  INTO v_open, v_last_end
  FROM public.task_cycles
  WHERE board_id = p_board_id
    AND status IN ('planned', 'active')
    AND deleted IS NOT TRUE;

  IF v_open >= 5 THEN
    RAISE EXCEPTION 'SPRINT_LIMIT_REACHED' USING ERRCODE = '55000';
  END IF;

  RETURN private.create_planned_board_sprint(p_board_id, v_last_end, p_actor_id);
END;
$$;

-- Removes the last planned sprint. Its tasks move to the sprint before it,
-- and one planned sprint always stays, so the board has a next sprint.
CREATE OR REPLACE FUNCTION public.remove_board_sprint(
  p_ws_id UUID,
  p_board_id UUID,
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
  v_previous public.task_cycles%ROWTYPE;
BEGIN
  PERFORM 1
  FROM public.workspace_boards
  WHERE id = p_board_id AND ws_id = p_ws_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SPRINT_BOARD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_cycle
  FROM public.task_cycles
  WHERE id = p_cycle_id AND board_id = p_board_id AND deleted IS NOT TRUE
  FOR UPDATE;

  IF v_cycle.id IS NULL THEN
    RAISE EXCEPTION 'SPRINT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_cycle.status <> 'planned' THEN
    RAISE EXCEPTION 'SPRINT_NOT_PLANNED' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_cycles
    WHERE board_id = v_cycle.board_id
      AND status = 'planned'
      AND deleted IS NOT TRUE
      AND sequence_number > v_cycle.sequence_number
  ) THEN
    RAISE EXCEPTION 'SPRINT_NOT_LAST' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_previous
  FROM public.task_cycles
  WHERE board_id = v_cycle.board_id
    AND status = 'planned'
    AND deleted IS NOT TRUE
    AND sequence_number < v_cycle.sequence_number
  ORDER BY sequence_number DESC
  LIMIT 1
  FOR UPDATE;

  IF v_previous.id IS NULL THEN
    RAISE EXCEPTION 'SPRINT_ONLY_PLANNED' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.task_cycle_tasks (task_id, cycle_id, carry_count)
  SELECT task_id, v_previous.id, carry_count
  FROM public.task_cycle_tasks
  WHERE cycle_id = v_cycle.id
  ON CONFLICT (task_id, cycle_id) DO NOTHING;

  -- Never started, so it has no report; its memberships go with it.
  DELETE FROM public.task_cycles WHERE id = v_cycle.id;

  RETURN v_previous;
END;
$$;

-- Open tasks of a board that sit in no open sprint: parked outside sprints,
-- shown in the Plan backlog and left off the Board view.
CREATE OR REPLACE FUNCTION public.list_board_unplanned_task_ids(
  p_ws_id UUID,
  p_board_id UUID
)
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_boards
    WHERE id = p_board_id AND ws_id = p_ws_id
  ) THEN
    RAISE EXCEPTION 'SPRINT_BOARD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT t.id
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
  ORDER BY t.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.add_board_sprint(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_board_sprint(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_board_unplanned_task_ids(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_board_sprint(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_board_sprint(UUID, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_board_unplanned_task_ids(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.set_board_sprint_length(UUID, SMALLINT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_board_sprint(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_board_sprint_length(UUID, SMALLINT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_board_sprint(UUID, UUID) TO service_role;
