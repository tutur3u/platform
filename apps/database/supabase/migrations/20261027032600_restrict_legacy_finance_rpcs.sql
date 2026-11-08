-- Restrict legacy finance chart RPCs and finance migration-helper RPCs to the
-- service role. They are SECURITY DEFINER, take a workspace id and have no
-- caller check. Every caller is a server route using a service-role client
-- (Finance balance chart after its finance-stats check; Infrastructure and
-- legacy Web migration exports). Bodies and their explicit search_path are
-- unchanged.
-- Rollback: apps/database/rollbacks/20261027032600_restrict_legacy_finance_rpcs.rollback.sql
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
      'revoke all on function %s from public, anon, authenticated',
      v_target
    );
    execute format('grant execute on function %s to service_role', v_target);
  end loop;
end;
$$;
