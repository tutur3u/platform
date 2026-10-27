-- Board sprints: a board can plan one sprint at a time on top of task cycles.
--
-- A sprint is a task cycle with a board_id. Statuses reuse the cycle values:
-- planned (being planned), active (running) and completed (ended). Each board
-- has at most one active and one planned sprint. Task membership stays in
-- task_cycle_tasks, so past sprints keep their history rows.
--
-- The sprint end is never written into tasks.end_date; clients derive it as the
-- default due date. Writes to board sprints go through the service-role RPCs
-- below, called by the tasks API after its board-access checks.

-- 1. Board setting. NULL keeps sprints off for the board.
ALTER TABLE public.workspace_boards
  ADD COLUMN sprint_length_weeks SMALLINT
    CONSTRAINT workspace_boards_sprint_length_weeks_check
      CHECK (sprint_length_weeks IN (1, 2));

COMMENT ON COLUMN public.workspace_boards.sprint_length_weeks IS
  'Sprint length in weeks (1 or 2). NULL means the board does not use sprints. Applies to the sprint being planned and later ones.';

-- 2. Cycles become board sprints when board_id is set.
ALTER TABLE public.task_cycles
  ADD COLUMN board_id UUID REFERENCES public.workspace_boards(id) ON DELETE CASCADE,
  ADD COLUMN sequence_number INTEGER,
  ADD COLUMN goal TEXT,
  ADD COLUMN goal_result TEXT,
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN ended_at TIMESTAMPTZ;

ALTER TABLE public.task_cycles
  ADD CONSTRAINT task_cycles_goal_length_check
    CHECK (goal IS NULL OR char_length(goal) <= 500),
  ADD CONSTRAINT task_cycles_goal_result_check
    CHECK (goal_result IS NULL OR goal_result IN ('met', 'partly', 'missed')),
  ADD CONSTRAINT task_cycles_board_sequence_check
    CHECK ((board_id IS NULL) = (sequence_number IS NULL));

CREATE UNIQUE INDEX task_cycles_board_sequence_key
  ON public.task_cycles (board_id, sequence_number)
  WHERE board_id IS NOT NULL;

CREATE UNIQUE INDEX task_cycles_one_active_per_board
  ON public.task_cycles (board_id)
  WHERE board_id IS NOT NULL AND status = 'active' AND deleted IS NOT TRUE;

CREATE UNIQUE INDEX task_cycles_one_planned_per_board
  ON public.task_cycles (board_id)
  WHERE board_id IS NOT NULL AND status = 'planned' AND deleted IS NOT TRUE;

COMMENT ON COLUMN public.task_cycles.board_id IS
  'Board that owns this sprint. NULL for workspace-wide cycles.';
COMMENT ON COLUMN public.task_cycles.sequence_number IS
  'Sprint number within its board (Sprint 1, Sprint 2, ...).';

-- 3. Membership metadata.
ALTER TABLE public.task_cycle_tasks
  ADD COLUMN added_after_start BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN carry_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT task_cycle_tasks_carry_count_check CHECK (carry_count >= 0),
  ADD COLUMN end_decision TEXT
    CONSTRAINT task_cycle_tasks_end_decision_check
      CHECK (end_decision IS NULL OR end_decision IN ('carry', 'backlog'));

CREATE INDEX IF NOT EXISTS task_cycle_tasks_cycle_id_idx
  ON public.task_cycle_tasks (cycle_id);

COMMENT ON COLUMN public.task_cycle_tasks.added_after_start IS
  'True when the task joined the sprint after it started.';
COMMENT ON COLUMN public.task_cycle_tasks.carry_count IS
  'How many sprint ends this task has been carried through before this sprint.';
COMMENT ON COLUMN public.task_cycle_tasks.end_decision IS
  'What happened to the open task when the sprint ended: carried with its owner, or sent to the backlog unassigned.';

-- 4. Reports, written once when a sprint ends.
CREATE TABLE public.task_sprint_reports (
  cycle_id UUID PRIMARY KEY REFERENCES public.task_cycles(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES public.workspace_boards(id) ON DELETE CASCADE,
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  next_cycle_id UUID REFERENCES public.task_cycles(id) ON DELETE SET NULL,
  ended_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  goal TEXT,
  goal_result TEXT CHECK (goal_result IS NULL OR goal_result IN ('met', 'partly', 'missed')),
  total_tasks INTEGER NOT NULL DEFAULT 0,
  done_tasks INTEGER NOT NULL DEFAULT 0,
  added_tasks INTEGER NOT NULL DEFAULT 0,
  carried_in_tasks INTEGER NOT NULL DEFAULT 0,
  carried_tasks INTEGER NOT NULL DEFAULT 0,
  backlog_tasks INTEGER NOT NULL DEFAULT 0,
  committed_points NUMERIC NOT NULL DEFAULT 0,
  done_points NUMERIC NOT NULL DEFAULT 0,
  added_points NUMERIC NOT NULL DEFAULT 0,
  people JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX task_sprint_reports_board_id_idx
  ON public.task_sprint_reports (board_id, ended_at DESC);
CREATE INDEX task_sprint_reports_ws_id_idx
  ON public.task_sprint_reports (ws_id);

ALTER TABLE public.task_sprint_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view sprint reports"
  ON public.task_sprint_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = task_sprint_reports.ws_id
        AND wm.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.task_sprint_reports FROM anon, authenticated;
GRANT SELECT ON public.task_sprint_reports TO authenticated;
GRANT ALL ON public.task_sprint_reports TO service_role;

COMMENT ON TABLE public.task_sprint_reports IS
  'Snapshot taken when a board sprint ends: tasks done, added mid-sprint, carried and sent to the backlog, plus per-person totals.';

-- 5. Direct writes stay open for workspace-wide cycles only. Board sprints
-- change through the RPCs below so starting and ending stay consistent.
DROP POLICY IF EXISTS "Users can view task cycles in their workspaces" ON public.task_cycles;
DROP POLICY IF EXISTS "Users can create task cycles in their workspaces" ON public.task_cycles;
DROP POLICY IF EXISTS "Users can update task cycles in their workspaces" ON public.task_cycles;
DROP POLICY IF EXISTS "Users can delete task cycles in their workspaces" ON public.task_cycles;

CREATE POLICY "Users can view task cycles in their workspaces"
  ON public.task_cycles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = task_cycles.ws_id
        AND wm.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can create task cycles in their workspaces"
  ON public.task_cycles
  FOR INSERT
  WITH CHECK (
    board_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = task_cycles.ws_id
        AND wm.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update task cycles in their workspaces"
  ON public.task_cycles
  FOR UPDATE
  USING (
    board_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = task_cycles.ws_id
        AND wm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (board_id IS NULL);

CREATE POLICY "Users can delete task cycles in their workspaces"
  ON public.task_cycles
  FOR DELETE
  USING (
    board_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = task_cycles.ws_id
        AND wm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage task cycle tasks in their workspaces" ON public.task_cycle_tasks;

CREATE POLICY "Users can manage task cycle tasks in their workspaces"
  ON public.task_cycle_tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.task_cycles tc
      JOIN public.workspace_members wm ON wm.ws_id = tc.ws_id
      WHERE tc.id = task_cycle_tasks.cycle_id
        AND tc.board_id IS NULL
        AND wm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.task_cycles tc
      JOIN public.workspace_members wm ON wm.ws_id = tc.ws_id
      WHERE tc.id = task_cycle_tasks.cycle_id
        AND tc.board_id IS NULL
        AND wm.user_id = (SELECT auth.uid())
    )
  );

-- 6. Helpers.

-- The Monday on or after a date.
CREATE OR REPLACE FUNCTION private.board_sprint_next_monday(p_day DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_day + ((8 - EXTRACT(ISODOW FROM p_day)::INTEGER) % 7);
$$;

-- A sprint runs Monday to Friday of its last week.
CREATE OR REPLACE FUNCTION private.board_sprint_end_date(p_start DATE, p_weeks INTEGER)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_start + (p_weeks * 7 - 3);
$$;

-- Creates the board's next planned sprint after p_after_end (or from today).
CREATE OR REPLACE FUNCTION private.create_planned_board_sprint(
  p_board_id UUID,
  p_after_end DATE,
  p_actor_id UUID
)
RETURNS public.task_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_board RECORD;
  v_sequence INTEGER;
  v_start DATE;
  v_cycle public.task_cycles%ROWTYPE;
BEGIN
  SELECT id, ws_id, creator_id, sprint_length_weeks
  INTO v_board
  FROM public.workspace_boards
  WHERE id = p_board_id;

  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_sequence
  FROM public.task_cycles
  WHERE board_id = p_board_id;

  v_start := private.board_sprint_next_monday(
    COALESCE(p_after_end + 1, CURRENT_DATE)
  );

  INSERT INTO public.task_cycles (
    name,
    ws_id,
    board_id,
    sequence_number,
    creator_id,
    status,
    start_date,
    end_date
  )
  VALUES (
    'Sprint ' || v_sequence,
    v_board.ws_id,
    p_board_id,
    v_sequence,
    COALESCE(p_actor_id, v_board.creator_id),
    'planned',
    v_start,
    private.board_sprint_end_date(v_start, COALESCE(v_board.sprint_length_weeks, 2))
  )
  RETURNING * INTO v_cycle;

  RETURN v_cycle;
END;
$$;

REVOKE ALL ON FUNCTION private.board_sprint_next_monday(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.board_sprint_end_date(DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.create_planned_board_sprint(UUID, DATE, UUID) FROM PUBLIC;

-- 7. Turning sprints on, off or changing their length.
CREATE OR REPLACE FUNCTION public.set_board_sprint_length(
  p_board_id UUID,
  p_weeks SMALLINT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS public.task_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- 8. Starting the planned sprint.
CREATE OR REPLACE FUNCTION public.start_board_sprint(
  p_cycle_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS public.task_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.set_board_sprint_length(UUID, SMALLINT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_board_sprint(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_board_sprint_length(UUID, SMALLINT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_board_sprint(UUID, UUID) TO service_role;
