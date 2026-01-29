-- Migration: Add date-range versions of chart functions for time navigation
-- These functions support explicit start/end dates for flexible chart navigation

-- Daily income/expense with date range
CREATE OR REPLACE FUNCTION public.get_daily_income_expense_range(
  _ws_id UUID,
  _start_date TIMESTAMPTZ DEFAULT NULL,
  _end_date TIMESTAMPTZ DEFAULT NULL,
  include_confidential BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  day DATE,
  total_income NUMERIC,
  total_expense NUMERIC
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

  -- Default to last 14 days if no dates provided
  v_end_date := COALESCE(_end_date::DATE, CURRENT_DATE);
  v_start_date := COALESCE(_start_date::DATE, v_end_date - INTERVAL '13 days');

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(v_start_date, v_end_date, '1 day'::interval)::DATE AS day
  ),
  daily_transactions AS (
    SELECT
      date_trunc('day', wt.taken_at::timestamp)::DATE AS day,
      SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END)::NUMERIC AS income,
      SUM(CASE WHEN wt.amount < 0 THEN wt.amount ELSE 0 END)::NUMERIC AS expense
    FROM
      wallet_transactions wt
      INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE
      wt.taken_at::date >= v_start_date
      AND wt.taken_at::date <= v_end_date
      AND ww.ws_id = _ws_id
      -- Confidential filtering
      AND (
        (NOT include_confidential AND NOT wt.is_amount_confidential)
        OR
        (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
      )
    GROUP BY
      date_trunc('day', wt.taken_at::timestamp)::DATE
  )
  SELECT
    ds.day,
    COALESCE(dt.income, 0)::NUMERIC AS total_income,
    ABS(COALESCE(dt.expense, 0))::NUMERIC AS total_expense
  FROM
    date_series ds
    LEFT JOIN daily_transactions dt ON ds.day = dt.day
  ORDER BY
    ds.day;
END;
$$;

-- Monthly income/expense with date range
CREATE OR REPLACE FUNCTION public.get_monthly_income_expense_range(
  _ws_id UUID,
  _start_date TIMESTAMPTZ DEFAULT NULL,
  _end_date TIMESTAMPTZ DEFAULT NULL,
  include_confidential BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  month DATE,
  total_income NUMERIC,
  total_expense NUMERIC
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
  WITH month_series AS (
    SELECT generate_series(v_start_date, v_end_date, '1 month'::interval)::DATE AS month
  ),
  monthly_transactions AS (
    SELECT
      date_trunc('month', wt.taken_at::timestamp)::DATE AS month,
      SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END)::NUMERIC AS income,
      SUM(CASE WHEN wt.amount < 0 THEN wt.amount ELSE 0 END)::NUMERIC AS expense
    FROM
      wallet_transactions wt
      INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE
      date_trunc('month', wt.taken_at::timestamp)::DATE >= v_start_date
      AND date_trunc('month', wt.taken_at::timestamp)::DATE <= v_end_date
      AND ww.ws_id = _ws_id
      -- Confidential filtering
      AND (
        (NOT include_confidential AND NOT wt.is_amount_confidential)
        OR
        (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
      )
    GROUP BY
      date_trunc('month', wt.taken_at::timestamp)::DATE
  )
  SELECT
    ms.month,
    COALESCE(mt.income, 0)::NUMERIC AS total_income,
    ABS(COALESCE(mt.expense, 0))::NUMERIC AS total_expense
  FROM
    month_series ms
    LEFT JOIN monthly_transactions mt ON ms.month = mt.month
  ORDER BY
    ms.month;
END;
$$;

-- Get wallet balance at a specific date
CREATE OR REPLACE FUNCTION public.get_wallet_balance_at_date(
  _ws_id UUID,
  _target_date TIMESTAMPTZ,
  include_confidential BOOLEAN DEFAULT TRUE
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  total NUMERIC;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(_ws_id, auth.uid(), 'view_confidential_amount');

  SELECT COALESCE(SUM(wt.amount), 0) INTO total
  FROM wallet_transactions wt
  JOIN workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = _ws_id
    AND wt.taken_at <= _target_date
    -- Confidential filtering
    AND (
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR
      (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN total;
END;
$$;

-- Get monthly category breakdown (expenses by category)
CREATE OR REPLACE FUNCTION public.get_monthly_category_breakdown(
  _ws_id UUID,
  _start_date TIMESTAMPTZ DEFAULT NULL,
  _end_date TIMESTAMPTZ DEFAULT NULL,
  include_confidential BOOLEAN DEFAULT TRUE
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
    AND wt.amount < 0  -- Only expenses
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_daily_income_expense_range(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_income_expense_range(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance_at_date(UUID, TIMESTAMPTZ, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_category_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.get_daily_income_expense_range(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) IS
  'Returns daily income and expense totals for a date range. Defaults to last 14 days if no dates provided.';

COMMENT ON FUNCTION public.get_monthly_income_expense_range(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) IS
  'Returns monthly income and expense totals for a date range. Defaults to last 12 months if no dates provided.';

COMMENT ON FUNCTION public.get_wallet_balance_at_date(UUID, TIMESTAMPTZ, BOOLEAN) IS
  'Returns the total wallet balance at a specific date (sum of all transactions up to that date).';

COMMENT ON FUNCTION public.get_monthly_category_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) IS
  'Returns monthly expense breakdown by category. Only includes expense transactions (negative amounts).';
