-- Manual rollback only (app first: no prefill link insert). Invoices are
-- untouched. Refuses while links exist: they are the only invoice-to-lock record.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed guard queries and a table lock, no EXECUTE or input.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_lock_invoice_links) THEN
    RAISE EXCEPTION 'fee lock invoice links exist; export and delete them first';
  END IF;
  LOCK TABLE public.fee_lock_invoice_links IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.fee_lock_invoice_links) THEN
    RAISE EXCEPTION 'fee lock invoice links were written during rollback; aborting';
  END IF;
END;
$guard$;

DROP TABLE public.fee_lock_invoice_links;
DROP FUNCTION private.fee_lock_invoice_links_same_workspace();

COMMIT;
