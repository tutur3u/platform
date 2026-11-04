-- Manual rollback only: removes fee_lock_invoice_links and its workspace
-- check. Invoices are untouched. Deploy app code with ENABLE_FEE_LOCK off (or
-- without the prefill link insert) first. Refuses while links exist, because
-- they are the only record of which invoice came from which locked fee.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed read-only guard query, no EXECUTE or input.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_lock_invoice_links) THEN
    RAISE EXCEPTION 'fee lock invoice links exist; export and delete them first';
  END IF;
END;
$guard$;

DROP TABLE public.fee_lock_invoice_links;
DROP FUNCTION private.fee_lock_invoice_links_check_ws();

COMMIT;
