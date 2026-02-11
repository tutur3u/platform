-- Migration: Update chart functions to support confidential transaction filtering
-- This allows charts to respect the confidential toggle setting

-- Update monthly income/expense function
CREATE OR REPLACE FUNCTION get_monthly_income_expense(
  _ws_id UUID,
  past_months INT DEFAULT 12,
  include_confidential boolean DEFAULT true
)
RETURNS TABLE(month DATE, total_income NUMERIC, total_expense NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(_ws_id, auth.uid(), 'view_confidential_amount');

  RETURN QUERY
  WITH month_series AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1), 
      date_trunc('month', CURRENT_DATE), 
      '1 month'::interval
    )::DATE AS month
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
      wt.taken_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1)
      AND wt.taken_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
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

-- Update daily income/expense function
CREATE OR REPLACE FUNCTION get_daily_income_expense(
  _ws_id UUID,
  past_days INT DEFAULT 14,
  include_confidential boolean DEFAULT true
)
RETURNS TABLE(day DATE, total_income NUMERIC, total_expense NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(_ws_id, auth.uid(), 'view_confidential_amount');

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(CURRENT_DATE - (past_days - 1), CURRENT_DATE, '1 day'::interval)::DATE AS day
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
      wt.taken_at::date >= CURRENT_DATE - (past_days - 1)
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_monthly_income_expense(UUID, INT, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_income_expense(UUID, INT, boolean) TO authenticated;

-- Update comments
COMMENT ON FUNCTION get_monthly_income_expense(UUID, INT, boolean) IS
  'Returns monthly income and expense totals. Set include_confidential=false to exclude confidential transactions.';

COMMENT ON FUNCTION get_daily_income_expense(UUID, INT, boolean) IS
  'Returns daily income and expense totals. Set include_confidential=false to exclude confidential transactions.';

