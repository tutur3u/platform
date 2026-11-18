-- Manual rollback only: restores the search_path values these functions had
-- before the pin.
BEGIN;

-- tuturuuu: reviewed(alter-routine-review): FIN-SEARCHPATH-01 search_path only; bodies already fully qualified
alter function private.create_inventory_period_invoice(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb
) set search_path = pg_catalog, private, public;

-- tuturuuu: reviewed(alter-routine-review): FIN-SEARCHPATH-01 search_path only; bodies already fully qualified
alter function private.get_finance_overview_metrics(
  uuid, uuid, text, date, date, boolean
) set search_path = public, pg_temp;

-- tuturuuu: reviewed(alter-routine-review): FIN-SEARCHPATH-01 search_path only; bodies already fully qualified
alter function public.get_transaction_list_enrichment(
  uuid, uuid[], uuid
) set search_path = public, pg_temp;

COMMIT;
