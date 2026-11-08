-- Keep all restore_hold fences set. Dropping this admission API releases nothing.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION IF EXISTS public.reconcile_meet_erasure_intent(uuid,uuid,uuid,uuid,text,bigint,bigint,text,uuid[]);
-- Preserve quarantine and intent rows for recovery; do not drop evidence tables.
COMMIT;
