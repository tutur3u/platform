-- Manual rollback only (app first: ENABLE_FEE_LOCK off; the built-in default
-- template needs no table). Refuses while workspace-authored templates exist.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed guard queries and a table lock, no EXECUTE or input.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_notice_templates) THEN
    RAISE EXCEPTION 'fee notice templates exist; export and delete them first';
  END IF;
  LOCK TABLE public.fee_notice_templates IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.fee_notice_templates) THEN
    RAISE EXCEPTION 'fee notice templates were written during rollback; aborting';
  END IF;
END;
$guard$;

DROP FUNCTION private.fee_notice_template_save(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);
DROP TABLE public.fee_notice_templates;

COMMIT;
