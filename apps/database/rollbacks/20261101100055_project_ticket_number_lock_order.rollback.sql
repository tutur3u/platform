-- Manual rollback only: restores the 20261101100040 ticket-number allocator,
-- which locks the project counter row before the board capacity lock. That
-- order can deadlock against a task save; prefer a forward fix.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION private.assign_project_ticket_number()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- Always allocate server-side; callers cannot supply or reuse a number.
  UPDATE public.task_projects SET next_ticket_number = next_ticket_number + 1
  WHERE id = NEW.project_id RETURNING next_ticket_number - 1 INTO NEW.ticket_number;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_TICKET_ALLOCATION_DENIED' USING ERRCODE = '42501'; END IF;
  NEW.created_at := coalesce(NEW.created_at, now());
  RETURN NEW;
END;
$$;
-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.assign_project_ticket_number() FROM PUBLIC, anon, authenticated;

COMMIT;
