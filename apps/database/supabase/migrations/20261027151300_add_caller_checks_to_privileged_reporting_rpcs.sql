-- Privileged reporting and credit RPCs are SECURITY DEFINER and take workspace
-- or user ids without checking the caller.
--
-- 1. Platform-admin and internal helpers are restricted to the service role.
--    Every application caller uses a service-role client (Infrastructure
--    dashboard and AI-credit admin routes, the AI credit helpers, Hive), and
--    every SQL caller is SECURITY DEFINER or pg_cron. Bodies are unchanged.
-- 2. Finance totals keep authenticated EXECUTE and gain a caller check at the
--    top of the existing body: the service role passes (server routes that
--    authorize first), otherwise auth.uid() must be set and hold the finance
--    permission. get_transaction_stats also binds p_user_id to auth.uid().
--    Each definition must contain its anchor exactly once or the migration
--    aborts. The SQL wrapper get_monthly_category_breakdown(..., text) is
--    guarded by the get_category_breakdown overload it calls.
--
-- PUBLIC and anon are revoked here as well, so this migration does not depend
-- on 20261027151200.
-- Rollback: apps/database/rollbacks/20261027151300_add_caller_checks_to_privileged_reporting_rpcs.rollback.sql

do $$
declare
  v_target regprocedure;
begin
  foreach v_target in array array[
    'public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)',
    'public.get_recent_audit_logs(integer)',
    'public.get_power_users(integer)',
    'public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb)',
    'public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb,uuid,integer,integer)',
    'public.get_or_create_credit_balance(uuid)',
    'public.get_or_create_credit_balance(uuid,uuid)',
    'public.get_ai_credit_usage_summary(uuid,timestamptz)',
    'public.get_ai_credit_usage_summary(uuid,timestamptz,uuid)',
    'public.admin_list_ai_credit_transactions(integer,integer,uuid,uuid,text,text,text,text,timestamptz,timestamptz)',
    'public.cleanup_role_inconsistencies()',
    'public.get_or_create_notification_batch(uuid,uuid,text,integer)',
    'public.get_or_create_notification_batch(uuid,uuid,text,integer,text)',
    'public.normalize_task_sort_keys()'
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

do $$
declare
  v_item record;
  v_definition text;
  v_guard text;
  v_anchor constant text := '^BEGIN\n';
  v_marker constant text := '-- caller check (20261027151300)';
  v_invoice_check constant text :=
    'public.has_workspace_permission(_ws_id, auth.uid(), ''view_invoices'') IS NOT TRUE';
  v_category_check constant text :=
    'NOT (
        public.has_workspace_permission(_ws_id, auth.uid(), ''view_finance_stats'') IS TRUE
        OR public.has_workspace_permission(_ws_id, auth.uid(), ''view_transactions'') IS TRUE
      )';
  v_stats_check constant text :=
    'p_user_id IS DISTINCT FROM auth.uid()
      OR NOT (
        public.has_workspace_permission(p_ws_id, auth.uid(), ''view_transactions'') IS TRUE
        OR public.has_workspace_permission(p_ws_id, auth.uid(), ''view_expenses'') IS TRUE
        OR public.has_workspace_permission(p_ws_id, auth.uid(), ''view_incomes'') IS TRUE
        OR public.has_workspace_permission(p_ws_id, auth.uid(), ''manage_finance'') IS TRUE
      )';
begin
  for v_item in
    select target::regprocedure as target, check_sql
    from (
      values
        ('public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date)', v_invoice_check),
        ('public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)', v_invoice_check),
        ('public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer)', v_invoice_check),
        ('public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)', v_invoice_check),
        ('public.get_category_breakdown(uuid,timestamptz,timestamptz,boolean,text,text)', v_category_check),
        ('public.get_category_breakdown(uuid,timestamptz,timestamptz,boolean,text,text,boolean)', v_category_check),
        ('public.get_monthly_category_breakdown(uuid,timestamptz,timestamptz,boolean)', v_category_check),
        ('public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz)', v_stats_check)
    ) as targets(target, check_sql)
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_item.target);

    if pg_catalog.strpos(v_definition, v_marker) = 0 then
      if pg_catalog.regexp_count(v_definition, v_anchor, 1, 'in') <> 1 then
        raise exception 'Unexpected body anchor in %', v_item.target;
      end if;

      v_guard := 'BEGIN
  ' || v_marker || '
  IF COALESCE(auth.role(), '''') <> ''service_role''
    AND (
      auth.uid() IS NULL
      OR ' || v_item.check_sql || '
    )
  THEN
    RAISE EXCEPTION ''Permission denied'' USING ERRCODE = ''42501'';
  END IF;
  -- end caller check
';

      execute pg_catalog.regexp_replace(v_definition, v_anchor, v_guard, 'in');
    end if;

    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_item.target
    );
    execute format(
      'grant execute on function %s to authenticated, service_role',
      v_item.target
    );
  end loop;
end;
$$;

revoke all on function public.get_monthly_category_breakdown(uuid, timestamptz, timestamptz, boolean, text)
  from public, anon, authenticated;
grant execute on function public.get_monthly_category_breakdown(uuid, timestamptz, timestamptz, boolean, text)
  to authenticated, service_role;
