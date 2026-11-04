-- Manual rollback only: drops the held periodic report action audit created by
-- 20261104120000_periodic_report_held_actions.sql. Deploy app code without the
-- held report action first. Reports already queued or skipped by the action
-- keep their state; this never queues, unskips or sends anything.
-- Refuses while audit rows exist: export them first, since this drops them.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed read-only guard query, no EXECUTE or input.
DO $guard$
BEGIN
  IF to_regclass('private.periodic_report_held_actions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM private.periodic_report_held_actions) THEN
      RAISE EXCEPTION 'held report audit rows exist; export them before dropping';
    END IF;
  END IF;
END;
$guard$;

DROP TABLE IF EXISTS private.periodic_report_held_actions;

COMMIT;
