-- Manual rollback only: drops the held periodic report action audit and the
-- held Send now / Skip functions created by
-- 20261104120000_periodic_report_held_actions.sql. Deploy app code without the
-- held report action first. Reports already queued or skipped by the action
-- keep their state; this never queues, unskips or sends anything.
-- Refuses while audit rows exist: export them first, since this drops them.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The lock comes first, so no audit row can be written between the check and the drop.
-- tuturuuu: reviewed(dynamic-sql-review): fixed lock and read-only guard query, no EXECUTE or input.
DO $guard$
BEGIN
  IF to_regclass('private.periodic_report_held_actions') IS NOT NULL THEN
    LOCK TABLE private.periodic_report_held_actions IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM private.periodic_report_held_actions) THEN
      RAISE EXCEPTION 'held report audit rows exist; export them before dropping';
    END IF;
  END IF;
END;
$guard$;

DROP FUNCTION IF EXISTS private.request_held_periodic_report_delivery(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS private.skip_held_periodic_reports(uuid, uuid[]);
DROP TABLE IF EXISTS private.periodic_report_held_actions;

COMMIT;
