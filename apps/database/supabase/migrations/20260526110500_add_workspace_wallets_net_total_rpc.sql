-- Calculate the finance overview net total in one RPC instead of fetching
-- separate income and expense totals and adding them in application code.

CREATE OR REPLACE FUNCTION public.get_workspace_wallets_net_total(
  ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  start_date timestamp with time zone DEFAULT NULL,
  end_date timestamp with time zone DEFAULT NULL,
  include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  can_view_transactions boolean;
  can_view_incomes boolean;
  can_view_expenses boolean;
  can_view_amount boolean;
  has_manage_finance boolean;
  has_granular boolean;
  allowed_wallet_ids uuid[];
  v_user_id uuid;
  result numeric;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    IF NOT public.has_workspace_permission(
      get_workspace_wallets_net_total.ws_id,
      auth.uid(),
      'manage_workspace_roles'
    ) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());

  SELECT
    ctx.can_view_transactions,
    ctx.can_view_incomes,
    ctx.can_view_expenses,
    ctx.can_view_amount,
    ctx.has_manage_finance,
    ctx.has_granular,
    ctx.allowed_wallet_ids
  INTO
    can_view_transactions,
    can_view_incomes,
    can_view_expenses,
    can_view_amount,
    has_manage_finance,
    has_granular,
    allowed_wallet_ids
  FROM public.get_wallet_permission_context(
    get_workspace_wallets_net_total.ws_id,
    v_user_id
  ) AS ctx;

  IF NOT has_manage_finance THEN
    IF has_granular AND NOT (can_view_incomes OR can_view_expenses) THEN
      RETURN 0;
    ELSIF NOT has_granular AND NOT can_view_transactions THEN
      RETURN 0;
    END IF;
  END IF;

  IF NOT has_manage_finance AND (allowed_wallet_ids IS NULL OR array_length(allowed_wallet_ids, 1) IS NULL) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww
    ON wt.wallet_id = ww.id
  WHERE ww.ws_id = get_workspace_wallets_net_total.ws_id
    AND (has_manage_finance OR ww.id = ANY(allowed_wallet_ids))
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
    AND (
      has_manage_finance
      OR NOT has_granular
      OR (wt.amount > 0 AND can_view_incomes)
      OR (wt.amount < 0 AND can_view_expenses)
    )
    AND (
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR (
        include_confidential
        AND (NOT wt.is_amount_confidential OR can_view_amount)
      )
    )
    AND (
      (start_date IS NULL AND end_date IS NULL)
      OR (start_date IS NULL AND wt.taken_at <= end_date)
      OR (end_date IS NULL AND wt.taken_at >= start_date)
      OR (wt.taken_at BETWEEN start_date AND end_date)
    );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_wallets_net_total(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean
) FROM public;
GRANT EXECUTE ON FUNCTION public.get_workspace_wallets_net_total(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean
) TO authenticated;

COMMENT ON FUNCTION public.get_workspace_wallets_net_total(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean
) IS
  'Returns the signed net wallet transaction total for a workspace date range, respecting wallet access and confidential amount permissions.';
