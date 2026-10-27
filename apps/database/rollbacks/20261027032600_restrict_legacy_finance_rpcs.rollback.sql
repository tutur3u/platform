-- Rollback for 20261027032600_restrict_legacy_finance_rpcs.sql.
-- Restores authenticated EXECUTE on the six functions. anon/PUBLIC stay
-- revoked: no supported caller uses them and restoring them re-opens
-- cross-workspace reads. Exact previous ACL (approval required):
--   grant execute on function <signature> to public, anon;  (all six; the
--   products helper previously had PUBLIC + authenticated only)
-- Not a migration: apply manually only with release-authority approval.
begin;
do $$
declare
  v_target regprocedure;
begin
  foreach v_target in array array[
    'public.get_daily_income_expense(uuid,integer,boolean)',
    'public.get_monthly_income_expense(uuid,integer,boolean)',
    'public.get_wallet_balance_at_date(uuid,timestamptz,boolean)',
    'public.get_finance_invoice_products_by_workspace(uuid,integer,integer)',
    'public.get_finance_invoice_promotions_by_workspace(uuid,integer,integer)',
    'public.get_finance_invoice_user_groups_by_workspace(uuid,integer,integer)'
  ]::regprocedure[]
  loop
    execute format(
      'grant execute on function %s to authenticated, service_role',
      v_target
    );
  end loop;
end;
$$;
commit;
