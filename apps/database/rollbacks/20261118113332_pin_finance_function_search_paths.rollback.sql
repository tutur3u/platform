-- Manual rollback only: restores the search_path values these functions had
-- before the pin.
BEGIN;

alter function private.create_inventory_period_invoice(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb
) set search_path = pg_catalog, private, public;

alter function private.get_finance_overview_metrics(
  uuid, uuid, text, date, date, boolean
) set search_path = public, pg_temp;

alter function public.get_transaction_list_enrichment(
  uuid, uuid[], uuid
) set search_path = public, pg_temp;

COMMIT;
