-- Manual rollback only: removes fee_notice_templates and its save function.
-- Deploy app code with ENABLE_FEE_LOCK off first; the built-in default
-- template keeps working without the table. Refuses while saved templates
-- exist, because they are workspace-authored text: export and delete first.
-- Its template_saved events stay in fee_lock_events.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): fixed read-only guard query, no EXECUTE or input.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_notice_templates) THEN
    RAISE EXCEPTION 'fee notice templates exist; export and delete them first';
  END IF;
END;
$guard$;

DROP FUNCTION private.fee_notice_template_save(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);
DROP TABLE public.fee_notice_templates;

COMMIT;
