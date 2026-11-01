-- Board sprints: a task that becomes open again on its board (moved back out
-- of Done, un-closed, or restored from the recycle bin) after its sprint ended
-- was left in no open sprint, so it vanished from the Board view and from
-- Plan. It now rejoins the board's current sprint when no open sprint holds
-- it: the running one, flagged as added mid-sprint, else the one being
-- planned. Builds on 20261101100010_board_sprint_lifecycle.sql.
CREATE OR REPLACE FUNCTION private.sync_task_board_sprint_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
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
  ORDER BY (c.status = 'active') DESC
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

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.sync_task_board_sprint_membership() FROM PUBLIC, anon, authenticated;

-- Reopening can clear completed_at or closed_at without a list change, and a
-- restore clears deleted_at, so those columns fire the trigger too.
DROP TRIGGER IF EXISTS sync_task_board_sprint_membership ON public.tasks;
CREATE TRIGGER sync_task_board_sprint_membership
  AFTER INSERT OR UPDATE OF list_id, completed_at, closed_at, deleted_at
  ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_task_board_sprint_membership();
