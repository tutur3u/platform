-- Migration: Add confidential toggle support to aggregation functions
-- This allows privileged users to toggle between including/excluding confidential transactions
-- for better observability and measurement

-- Update aggregation functions to support include_confidential parameter
-- When include_confidential = false, exclude confidential transactions even if user has permission
-- When include_confidential = true (default), respect permissions as before

-- Function to get total income (sum of positive amounts)
CREATE OR REPLACE FUNCTION public.get_wallet_income_sum(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  result numeric;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');

  -- Calculate sum of income transactions
  -- If include_confidential = false, exclude ALL confidential transactions
  -- If include_confidential = true, respect permissions (existing behavior)
  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount > 0
    AND (
      -- If excluding confidential, only include non-confidential
      (NOT p_include_confidential AND NOT wt.is_amount_confidential)
      OR
      -- If including confidential, respect permissions
      (p_include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN result;
END;
$$;

-- Function to get income transaction count
CREATE OR REPLACE FUNCTION public.get_wallet_income_count(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_include_confidential boolean DEFAULT true
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  result bigint;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');

  -- Count income transactions
  SELECT COUNT(*)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount > 0
    AND (
      (NOT p_include_confidential AND NOT wt.is_amount_confidential)
      OR
      (p_include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN result;
END;
$$;

-- Function to get total expense (sum of negative amounts)
CREATE OR REPLACE FUNCTION public.get_wallet_expense_sum(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  result numeric;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');

  -- Calculate sum of expense transactions
  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount < 0
    AND (
      (NOT p_include_confidential AND NOT wt.is_amount_confidential)
      OR
      (p_include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN result;
END;
$$;

-- Function to get expense transaction count
CREATE OR REPLACE FUNCTION public.get_wallet_expense_count(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_include_confidential boolean DEFAULT true
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  result bigint;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');

  -- Count expense transactions
  SELECT COUNT(*)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount < 0
    AND (
      (NOT p_include_confidential AND NOT wt.is_amount_confidential)
      OR
      (p_include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN result;
END;
$$;

-- Update existing workspace-level functions to handle confidential transactions
-- These functions are used by the finance dashboard statistics

CREATE OR REPLACE FUNCTION public.get_workspace_wallets_income(
  ws_id uuid,
  start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  result numeric;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(ws_id, auth.uid(), 'view_confidential_amount');

  -- Calculate sum of income transactions with date filtering
  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = $1
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
    AND wt.amount > 0
    AND (
      -- Confidential filtering
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR
      (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    )
    AND (
      -- Date filtering (existing logic)
      (start_date IS NULL AND end_date IS NULL)
      OR (start_date IS NULL AND wt.taken_at <= $3)
      OR (end_date IS NULL AND wt.taken_at >= $2)
      OR (wt.taken_at BETWEEN $2 AND $3)
    );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_wallets_expense(
  ws_id uuid,
  start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  result numeric;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(ws_id, auth.uid(), 'view_confidential_amount');

  -- Calculate sum of expense transactions with date filtering
  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = $1
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
    AND wt.amount < 0
    AND (
      -- Confidential filtering
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR
      (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    )
    AND (
      -- Date filtering (existing logic)
      (start_date IS NULL AND end_date IS NULL)
      OR (start_date IS NULL AND wt.taken_at <= $3)
      OR (end_date IS NULL AND wt.taken_at >= $2)
      OR (wt.taken_at BETWEEN $2 AND $3)
    );

  RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_wallet_income_sum(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_income_count(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_expense_sum(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_expense_count(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_wallets_income(uuid, timestamp with time zone, timestamp with time zone, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_wallets_expense(uuid, timestamp with time zone, timestamp with time zone, boolean) TO authenticated;

-- Update comments
COMMENT ON FUNCTION public.get_wallet_income_sum(uuid, uuid, boolean) IS
  'Returns the sum of income transactions. Set include_confidential=false to exclude confidential transactions even if user has permission.';

COMMENT ON FUNCTION public.get_workspace_wallets_income(uuid, timestamp with time zone, timestamp with time zone, boolean) IS
  'Returns the sum of income transactions for a workspace with date filtering. Set include_confidential=false to exclude confidential transactions.';

COMMENT ON FUNCTION public.get_workspace_wallets_expense(uuid, timestamp with time zone, timestamp with time zone, boolean) IS
  'Returns the sum of expense transactions for a workspace with date filtering. Set include_confidential=false to exclude confidential transactions.';

