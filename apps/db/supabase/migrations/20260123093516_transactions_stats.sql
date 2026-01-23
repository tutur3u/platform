-- Create a function to get transaction statistics based on filters
CREATE OR REPLACE FUNCTION public.get_transaction_stats(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_wallet_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_creator_ids uuid[] DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  total_transactions bigint,
  total_income numeric,
  total_expense numeric,
  net_total numeric,
  has_redacted_amounts boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_can_view_transactions boolean;
  v_can_view_expenses boolean;
  v_can_view_incomes boolean;
  v_can_view_amount boolean;
  v_has_manage_finance boolean;
  v_has_granular_permissions boolean;
  v_allowed_wallet_ids uuid[];
BEGIN
  -- Check user permissions
  v_can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  v_can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  v_can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  v_can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  v_has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');
  v_has_granular_permissions := v_can_view_expenses OR v_can_view_incomes;

  -- Wallet access control
  IF NOT v_has_manage_finance THEN
    SELECT array_agg(DISTINCT wrww.wallet_id)
    INTO v_allowed_wallet_ids
    FROM public.workspace_role_wallet_whitelist wrww
    JOIN public.workspace_role_members wrm ON wrm.role_id = wrww.role_id
    JOIN public.workspace_roles wr ON wr.id = wrww.role_id
    WHERE wr.ws_id = p_ws_id AND wrm.user_id = p_user_id;

    IF v_allowed_wallet_ids IS NULL THEN
      RETURN QUERY SELECT 0::bigint, 0::numeric, 0::numeric, 0::numeric, false;
      RETURN;
    END IF;

    IF p_wallet_ids IS NOT NULL THEN
      p_wallet_ids := (
        SELECT array_agg(u)
        FROM unnest(p_wallet_ids) AS u
        WHERE u = ANY(v_allowed_wallet_ids)
      );
      IF p_wallet_ids IS NULL OR array_length(p_wallet_ids, 1) IS NULL THEN
        RETURN QUERY SELECT 0::bigint, 0::numeric, 0::numeric, 0::numeric, false;
        RETURN;
      END IF;
    ELSE
      p_wallet_ids := v_allowed_wallet_ids;
    END IF;
  END IF;

  RETURN QUERY
  WITH filtered_data AS (
    SELECT 
      wt.amount,
      wt.is_amount_confidential
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE ww.ws_id = p_ws_id
      AND (v_has_manage_finance OR wt.wallet_id = ANY(v_allowed_wallet_ids))
      AND (
        (NOT v_has_granular_permissions AND v_can_view_transactions)
        OR (v_can_view_expenses AND wt.amount < 0)
        OR (v_can_view_incomes AND wt.amount > 0)
      )
      AND (p_wallet_ids IS NULL OR wt.wallet_id = ANY(p_wallet_ids))
      AND (p_category_ids IS NULL OR wt.category_id = ANY(p_category_ids))
      AND (p_creator_ids IS NULL OR (wt.creator_id = ANY(p_creator_ids) OR wt.platform_creator_id = ANY(p_creator_ids)))
      AND (p_start_date IS NULL OR wt.taken_at >= p_start_date)
      AND (p_end_date IS NULL OR wt.taken_at <= p_end_date)
      AND (p_search_query IS NULL OR wt.description ILIKE '%' || p_search_query || '%')
  )
  SELECT
    COUNT(*) as total_transactions,
    COALESCE(SUM(CASE WHEN amount > 0 AND (NOT is_amount_confidential OR v_can_view_amount) THEN amount ELSE 0 END), 0) as total_income,
    COALESCE(SUM(CASE WHEN amount < 0 AND (NOT is_amount_confidential OR v_can_view_amount) THEN amount ELSE 0 END), 0) as total_expense,
    COALESCE(SUM(CASE WHEN NOT is_amount_confidential OR v_can_view_amount THEN amount ELSE 0 END), 0) as net_total,
    EXISTS (SELECT 1 FROM filtered_data WHERE is_amount_confidential AND NOT v_can_view_amount) as has_redacted_amounts
  FROM filtered_data;
END;
$$;
