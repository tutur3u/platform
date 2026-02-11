-- Migration: Add optimized transaction aggregation functions
-- These functions perform SUM and COUNT operations directly in PostgreSQL
-- instead of fetching all rows and aggregating in application code

-- Function to get total income (sum of positive amounts)
CREATE OR REPLACE FUNCTION public.get_wallet_income_sum(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
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
  -- Only include amounts that are:
  -- 1. Positive (income)
  -- 2. Either non-confidential OR user has permission to view confidential amounts
  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount > 0
    AND (NOT wt.is_amount_confidential OR can_view_amount);

  RETURN result;
END;
$$;

-- Function to get income transaction count
CREATE OR REPLACE FUNCTION public.get_wallet_income_count(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
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
  -- Only include transactions that are:
  -- 1. Positive amount (income)
  -- 2. Either non-confidential OR user has permission to view confidential amounts
  SELECT COUNT(*)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount > 0
    AND (NOT wt.is_amount_confidential OR can_view_amount);

  RETURN result;
END;
$$;

-- Function to get total expense (sum of negative amounts)
CREATE OR REPLACE FUNCTION public.get_wallet_expense_sum(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
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
  -- Only include amounts that are:
  -- 1. Negative (expense)
  -- 2. Either non-confidential OR user has permission to view confidential amounts
  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount < 0
    AND (NOT wt.is_amount_confidential OR can_view_amount);

  RETURN result;
END;
$$;

-- Function to get expense transaction count
CREATE OR REPLACE FUNCTION public.get_wallet_expense_count(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
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
  -- Only include transactions that are:
  -- 1. Negative amount (expense)
  -- 2. Either non-confidential OR user has permission to view confidential amounts
  SELECT COUNT(*)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount < 0
    AND (NOT wt.is_amount_confidential OR can_view_amount);

  RETURN result;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_wallet_income_sum(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_income_count(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_expense_sum(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_expense_count(uuid, uuid) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.get_wallet_income_sum(uuid, uuid) IS
  'Returns the sum of all income transactions (amount > 0) for a workspace, respecting confidential amount permissions. Excludes confidential amounts if user lacks view_confidential_amount permission.';

COMMENT ON FUNCTION public.get_wallet_income_count(uuid, uuid) IS
  'Returns the count of income transactions (amount > 0) for a workspace, respecting confidential amount permissions. Excludes confidential transactions if user lacks view_confidential_amount permission.';

COMMENT ON FUNCTION public.get_wallet_expense_sum(uuid, uuid) IS
  'Returns the sum of all expense transactions (amount < 0) for a workspace, respecting confidential amount permissions. Excludes confidential amounts if user lacks view_confidential_amount permission.';

COMMENT ON FUNCTION public.get_wallet_expense_count(uuid, uuid) IS
  'Returns the count of expense transactions (amount < 0) for a workspace, respecting confidential amount permissions. Excludes confidential transactions if user lacks view_confidential_amount permission.';

