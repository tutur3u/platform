-- Manual rollback only: restores the 20261101100010 task sprint membership
-- trigger, which fires on list moves only. Reopened, un-closed and restored
-- tasks stop rejoining the board's current sprint. Run the 20261101100070
-- rollback first (it restores this migration's version), then this one. No
-- data changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION private.sync_task_board_sprint_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_cycle RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.board_id IS NOT DISTINCT FROM NEW.board_id THEN
      RETURN NEW;
    END IF;

    IF OLD.board_id IS NOT NULL THEN
      DELETE FROM public.task_cycle_tasks tct
      USING public.task_cycles c
      WHERE c.id = tct.cycle_id
        AND tct.task_id = NEW.id
        AND c.board_id = OLD.board_id
        AND c.status IN ('planned', 'active');
    END IF;
  END IF;

  IF NEW.board_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS sync_task_board_sprint_membership ON public.tasks;
CREATE TRIGGER sync_task_board_sprint_membership
  AFTER INSERT OR UPDATE OF list_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_task_board_sprint_membership();

COMMIT;
