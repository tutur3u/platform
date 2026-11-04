-- Manual rollback only: drops the fee lock tables and trigger functions. Roll back
-- 20261104060300 first and deploy with ENABLE_FEE_LOCK off. Refuses while any fee
-- lock or event exists (export and delete them first): checked without a lock to
-- fail fast, then again under ACCESS EXCLUSIVE so nothing arrives before the drop.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed read-only guard queries, no EXECUTE or input.
DO $precheck$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_locks) OR EXISTS (SELECT 1 FROM public.fee_lock_events) THEN RAISE EXCEPTION 'fee lock data exists; export and delete it first'; END IF;
END;
$precheck$;

LOCK TABLE public.fee_locks, public.fee_lock_lines, public.fee_lock_revisions, public.fee_lock_events
  IN ACCESS EXCLUSIVE MODE;

-- tuturuuu: reviewed(dynamic-sql-review): fixed read-only guard queries, no EXECUTE or input.
DO $recheck$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_locks) OR EXISTS (SELECT 1 FROM public.fee_lock_events) THEN RAISE EXCEPTION 'fee lock data arrived during rollback'; END IF;
END;
$recheck$;

DROP TABLE public.fee_lock_events;
DROP TABLE public.fee_lock_revisions;
DROP TABLE public.fee_lock_lines;
DROP TABLE public.fee_locks;
DROP FUNCTION private.fee_lock_same_workspace();
DROP FUNCTION private.fee_lock_revisions_append_only();

COMMIT;
