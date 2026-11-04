-- Manual rollback only: removes the fee lock tables and the append-only
-- trigger function. Run the 20261104060300 (fee lock functions) rollback
-- first, and deploy app code with ENABLE_FEE_LOCK off everywhere.
-- This destroys fee lock data (headers, lines, locked revisions, events), so
-- it refuses while any fee lock or event exists: export and delete them first.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed read-only guard queries, no EXECUTE or input.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_locks)
    OR EXISTS (SELECT 1 FROM public.fee_lock_events)
  THEN
    RAISE EXCEPTION 'fee lock data exists; export and delete it first';
  END IF;
END;
$guard$;

DROP TABLE public.fee_lock_events;
DROP TABLE public.fee_lock_revisions;
DROP TABLE public.fee_lock_lines;
DROP TABLE public.fee_locks;
DROP FUNCTION private.fee_lock_revisions_block_update();

COMMIT;
