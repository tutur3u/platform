-- Pin the search_path of three finance functions that touch
-- private.workspace_wallets. Every relation, type and non-catalog function in
-- their bodies is already schema-qualified, and their CTE and variable names
-- shadow nothing in pg_catalog, so only the path changes. Bodies, SECURITY
-- settings and grants are unchanged.

alter function private.create_inventory_period_invoice(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb
) set search_path = pg_catalog, pg_temp;

alter function private.get_finance_overview_metrics(
  uuid, uuid, text, date, date, boolean
) set search_path = pg_catalog, pg_temp;

alter function public.get_transaction_list_enrichment(
  uuid, uuid[], uuid
) set search_path = pg_catalog, pg_temp;
