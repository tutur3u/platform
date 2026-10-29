-- Board sprints: with several planned sprints (see
-- 20261029020600_board_sprint_horizon.sql), work that moves on goes to the
-- earliest planned one. Ending a sprint carries its open tasks there, and a new,
-- moved or reopened task joins the running sprint, else that next sprint.

-- 1. Ending carries work into the earliest planned sprint.
CREATE OR REPLACE FUNCTION public.end_board_sprint(
  p_cycle_id UUID,
  p_actor_id UUID DEFAULT NULL,
  p_decisions JSONB DEFAULT '{}'::jsonb,
  p_goal_result TEXT DEFAULT NULL
)
RETURNS public.task_sprint_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle public.task_cycles%ROWTYPE;
  v_next public.task_cycles%ROWTYPE;
  v_report public.task_sprint_reports%ROWTYPE;
  v_member RECORD;
  v_decision TEXT;
  v_removed RECORD;
  v_carried INTEGER := 0;
  v_backlog INTEGER := 0;
BEGIN
  IF p_goal_result IS NOT NULL AND p_goal_result NOT IN ('met', 'partly', 'missed') THEN
    RAISE EXCEPTION 'SPRINT_GOAL_RESULT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_decisions IS NOT NULL AND jsonb_typeof(p_decisions) <> 'object' THEN
    RAISE EXCEPTION 'SPRINT_DECISIONS_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Board row first, then cycles: the order every sprint writer uses (see
  -- start_board_sprint), so task membership writes cannot deadlock with it.
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

  IF v_cycle.status = 'completed' THEN
    SELECT * INTO v_report FROM public.task_sprint_reports WHERE cycle_id = v_cycle.id;
    IF v_report.cycle_id IS NOT NULL THEN
      RETURN v_report;
    END IF;
  END IF;

  IF v_cycle.status <> 'active' THEN
    RAISE EXCEPTION 'SPRINT_NOT_ACTIVE' USING ERRCODE = '55000';
  END IF;

  -- Carried work goes to the next sprint: the earliest planned one.
  SELECT * INTO v_next
  FROM public.task_cycles
  WHERE board_id = v_cycle.board_id AND status = 'planned' AND deleted IS NOT TRUE
  ORDER BY sequence_number
  LIMIT 1
  FOR UPDATE;

  IF v_next.id IS NULL THEN
    v_next := private.create_planned_board_sprint(
      v_cycle.board_id,
      v_cycle.end_date,
      p_actor_id
    );
  END IF;

  -- Snapshot before anything moves.
  INSERT INTO public.task_sprint_reports (
    cycle_id,
    board_id,
    ws_id,
    next_cycle_id,
    ended_by,
    goal,
    goal_result,
    total_tasks,
    done_tasks,
    added_tasks,
    carried_in_tasks,
    committed_points,
    done_points,
    added_points,
    people
  )
  SELECT
    v_cycle.id,
    v_cycle.board_id,
    v_cycle.ws_id,
    v_next.id,
    p_actor_id,
    v_cycle.goal,
    COALESCE(p_goal_result, v_cycle.goal_result),
    COUNT(*),
    COUNT(*) FILTER (WHERE m.is_done),
    COUNT(*) FILTER (WHERE m.added_after_start),
    COUNT(*) FILTER (WHERE m.carry_count > 0),
    COALESCE(SUM(m.points) FILTER (WHERE NOT m.added_after_start), 0),
    COALESCE(SUM(m.points) FILTER (WHERE m.is_done), 0),
    COALESCE(SUM(m.points) FILTER (WHERE m.added_after_start), 0),
    COALESCE((
      SELECT jsonb_agg(person ORDER BY person ->> 'user_id')
      FROM (
        SELECT jsonb_build_object(
          'user_id', ta.user_id,
          'total_tasks', COUNT(*),
          'done_tasks', COUNT(*) FILTER (
            WHERE t2.completed_at IS NOT NULL OR t2.closed_at IS NOT NULL
          ),
          'total_points', COALESCE(SUM(t2.estimation_points), 0),
          'done_points', COALESCE(SUM(t2.estimation_points) FILTER (
            WHERE t2.completed_at IS NOT NULL OR t2.closed_at IS NOT NULL
          ), 0)
        ) AS person
        FROM public.task_cycle_tasks tct2
        JOIN public.tasks t2 ON t2.id = tct2.task_id AND t2.deleted_at IS NULL
        JOIN public.task_assignees ta ON ta.task_id = t2.id
        WHERE tct2.cycle_id = v_cycle.id
        GROUP BY ta.user_id
      ) people
    ), '[]'::jsonb)
  FROM (
    SELECT
      tct.added_after_start,
      tct.carry_count,
      COALESCE(t.estimation_points, 0) AS points,
      (t.completed_at IS NOT NULL OR t.closed_at IS NOT NULL) AS is_done
    FROM public.task_cycle_tasks tct
    JOIN public.tasks t ON t.id = tct.task_id AND t.deleted_at IS NULL
    WHERE tct.cycle_id = v_cycle.id
  ) m
  RETURNING * INTO v_report;

  FOR v_member IN
    SELECT tct.task_id, tct.carry_count
    FROM public.task_cycle_tasks tct
    JOIN public.tasks t ON t.id = tct.task_id
    WHERE tct.cycle_id = v_cycle.id
      AND t.deleted_at IS NULL
      AND t.completed_at IS NULL
      AND t.closed_at IS NULL
    ORDER BY tct.task_id
  LOOP
    v_decision := COALESCE(p_decisions ->> v_member.task_id::text, 'carry');

    IF v_decision NOT IN ('carry', 'backlog') THEN
      RAISE EXCEPTION 'SPRINT_DECISIONS_INVALID' USING ERRCODE = '22023';
    END IF;

    UPDATE public.task_cycle_tasks
    SET end_decision = v_decision
    WHERE task_id = v_member.task_id AND cycle_id = v_cycle.id;

    INSERT INTO public.task_cycle_tasks (task_id, cycle_id, carry_count)
    VALUES (v_member.task_id, v_next.id, v_member.carry_count + 1)
    ON CONFLICT (task_id, cycle_id)
    DO UPDATE SET carry_count = GREATEST(
      public.task_cycle_tasks.carry_count,
      EXCLUDED.carry_count
    );

    IF v_decision = 'backlog' THEN
      v_backlog := v_backlog + 1;

      FOR v_removed IN
        DELETE FROM public.task_assignees
        WHERE task_id = v_member.task_id
        RETURNING user_id
      LOOP
        PERFORM public.insert_task_history(
          v_member.task_id,
          'assignee_removed',
          NULL,
          jsonb_build_object('user_id', v_removed.user_id),
          NULL,
          jsonb_build_object(
            'ws_id', v_cycle.ws_id,
            'board_id', v_cycle.board_id,
            'sprint_id', v_cycle.id,
            'reason', 'sprint_backlog'
          ),
          p_actor_id
        );
      END LOOP;
    ELSE
      v_carried := v_carried + 1;
    END IF;
  END LOOP;

  UPDATE public.task_sprint_reports
  SET carried_tasks = v_carried,
      backlog_tasks = v_backlog
  WHERE cycle_id = v_cycle.id
  RETURNING * INTO v_report;

  UPDATE public.task_cycles
  SET status = 'completed',
      ended_at = now(),
      goal_result = COALESCE(p_goal_result, goal_result),
      updated_at = now()
  WHERE id = v_cycle.id;

  RETURN v_report;
END;
$$;

-- 2. New, moved and reopened tasks join the running sprint, else the
-- earliest planned one.
CREATE OR REPLACE FUNCTION private.sync_task_board_sprint_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle RECORD;
  v_reopened BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.board_id IS DISTINCT FROM NEW.board_id THEN
      -- Leaving a board drops its open sprint membership. Lock both boards
      -- first, in id order so opposite moves cannot deadlock, so a sprint
      -- move on the old board (which holds it FOR UPDATE) either finishes
      -- before this deletion or sees the task already gone.
      PERFORM 1
      FROM public.workspace_boards
      WHERE id IN (OLD.board_id, NEW.board_id)
      ORDER BY id
      FOR SHARE;
      IF OLD.board_id IS NOT NULL THEN
        DELETE FROM public.task_cycle_tasks tct
        USING public.task_cycles c
        WHERE c.id = tct.cycle_id
          AND tct.task_id = NEW.id
          AND c.board_id = OLD.board_id
          AND c.status IN ('planned', 'active');
      END IF;
    ELSE
      -- Same board: only a task that is open again (reopened, un-closed or
      -- restored) needs a sprint; otherwise membership stays as it is.
      v_reopened :=
        NEW.deleted_at IS NULL
        AND NEW.completed_at IS NULL
        AND NEW.closed_at IS NULL
        AND (
          OLD.deleted_at IS NOT NULL
          OR OLD.completed_at IS NOT NULL
          OR OLD.closed_at IS NOT NULL
        );
      IF NOT v_reopened THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF NEW.board_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Wait for any sprint start, end or move on this board to finish (they hold
  -- the board row FOR UPDATE), so a task reopened while its sprint ends is
  -- either carried by the end or sees the sprint completed and rejoins below.
  PERFORM 1
  FROM public.workspace_boards
  WHERE id = NEW.board_id AND sprint_length_weeks IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- A task sits in at most one open sprint per board.
  IF EXISTS (
    SELECT 1
    FROM public.task_cycle_tasks tct
    JOIN public.task_cycles c ON c.id = tct.cycle_id
    WHERE tct.task_id = NEW.id
      AND c.board_id = NEW.board_id
      AND c.status IN ('planned', 'active')
      AND c.deleted IS NOT TRUE
  ) THEN
    RETURN NEW;
  END IF;

  SELECT c.id, c.status
  INTO v_cycle
  FROM public.task_cycles c
  JOIN public.workspace_boards wb ON wb.id = c.board_id
  WHERE c.board_id = NEW.board_id
    AND wb.sprint_length_weeks IS NOT NULL
    AND c.status IN ('active', 'planned')
    AND c.deleted IS NOT TRUE
  ORDER BY (c.status = 'active') DESC, c.sequence_number
  LIMIT 1;

  IF v_cycle.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.task_cycle_tasks (task_id, cycle_id, added_after_start)
  VALUES (NEW.id, v_cycle.id, v_cycle.status = 'active')
  ON CONFLICT (task_id, cycle_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.end_board_sprint(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_task_board_sprint_membership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_board_sprint(UUID, UUID, JSONB, TEXT) TO service_role;
