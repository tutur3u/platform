-- Manual rollback only: drops the compensating-cleanup function and restores
-- the Phase 1 event list. Deploy app code that no longer calls it first.
-- Refuses while invoice_discarded events exist (they would break the CHECK).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed read-only guard query, no EXECUTE or input.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_lock_events WHERE event_type = 'invoice_discarded') THEN
    RAISE EXCEPTION 'invoice_discarded events exist; export them first';
  END IF;
END;
$guard$;

DROP FUNCTION private.fee_lock_discard_new_invoice(UUID, UUID, UUID, TIMESTAMPTZ, TEXT);
ALTER TABLE public.fee_lock_events DROP CONSTRAINT fee_lock_events_event_type_check;
ALTER TABLE public.fee_lock_events ADD CONSTRAINT fee_lock_events_event_type_check CHECK (event_type IN (
  'draft_saved', 'locked', 'reopened', 'exported', 'template_saved', 'prefill_applied', 'invoice_linked'
)) NOT VALID;

COMMIT;
