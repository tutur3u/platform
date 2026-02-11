-- Migration: Add transaction_type parameter to get_monthly_category_breakdown
-- This allows fetching income OR expense categories breakdown

-- Drop and recreate with new parameter
CREATE OR REPLACE FUNCTION public.get_monthly_category_breakdown(
  _ws_id UUID,
  _start_date TIMESTAMPTZ DEFAULT NULL,
  _end_date TIMESTAMPTZ DEFAULT NULL,
  include_confidential BOOLEAN DEFAULT TRUE,
  _transaction_type TEXT DEFAULT 'expense'  -- 'expense', 'income', or 'all'
)
RETURNS TABLE (
  month DATE,
  category_id UUID,
  category_name TEXT,
  category_icon TEXT,
  category_color TEXT,
  total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(_ws_id, auth.uid(), 'view_confidential_amount');

  -- Default to last 12 months if no dates provided
  v_end_date := COALESCE(date_trunc('month', _end_date)::DATE, date_trunc('month', CURRENT_DATE)::DATE);
  v_start_date := COALESCE(date_trunc('month', _start_date)::DATE, v_end_date - INTERVAL '11 months');

  RETURN QUERY
  SELECT
    date_trunc('month', wt.taken_at)::DATE AS month,
    tc.id AS category_id,
    COALESCE(tc.name, 'Uncategorized')::TEXT AS category_name,
    tc.icon::TEXT AS category_icon,
    tc.color::TEXT AS category_color,
    COALESCE(SUM(ABS(wt.amount)), 0)::NUMERIC AS total
  FROM wallet_transactions wt
  JOIN workspace_wallets ww ON wt.wallet_id = ww.id
  LEFT JOIN transaction_categories tc ON wt.category_id = tc.id
  WHERE ww.ws_id = _ws_id
    -- Transaction type filter
    AND (
      (_transaction_type = 'expense' AND wt.amount < 0)
      OR (_transaction_type = 'income' AND wt.amount > 0)
      OR (_transaction_type = 'all')
    )
    AND date_trunc('month', wt.taken_at)::DATE >= v_start_date
    AND date_trunc('month', wt.taken_at)::DATE <= v_end_date
    -- Confidential filtering
    AND (
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR
      (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    )
  GROUP BY date_trunc('month', wt.taken_at), tc.id, tc.name, tc.icon, tc.color
  ORDER BY month, total DESC;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.get_monthly_category_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT) IS
  'Returns monthly breakdown by category. transaction_type can be "expense" (negative amounts), "income" (positive amounts), or "all".';
