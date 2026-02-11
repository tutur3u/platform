-- Migration: Add anchor_to_latest parameter to get_category_breakdown
-- When true, anchors the date range to the most recent transaction instead of current date
-- This ensures there's always data to display even if recent days have no transactions

CREATE OR REPLACE FUNCTION public.get_category_breakdown(
  _ws_id UUID,
  _start_date TIMESTAMPTZ DEFAULT NULL,
  _end_date TIMESTAMPTZ DEFAULT NULL,
  include_confidential BOOLEAN DEFAULT TRUE,
  _transaction_type TEXT DEFAULT 'expense',  -- 'expense', 'income', or 'all'
  _interval TEXT DEFAULT 'monthly',  -- 'daily', 'weekly', 'monthly', or 'yearly'
  _anchor_to_latest BOOLEAN DEFAULT FALSE  -- When true, anchors to most recent transaction
)
RETURNS TABLE (
  period DATE,
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
  v_interval TEXT;
  v_latest_date DATE;
BEGIN
  -- Check if user has permission to view confidential amounts
  can_view_amount := public.has_workspace_permission(_ws_id, auth.uid(), 'view_confidential_amount');

  -- Validate and normalize interval
  v_interval := CASE _interval
    WHEN 'daily' THEN 'day'
    WHEN 'weekly' THEN 'week'
    WHEN 'monthly' THEN 'month'
    WHEN 'yearly' THEN 'year'
    ELSE 'month'  -- Default to month
  END;

  -- Determine end date
  IF _end_date IS NOT NULL THEN
    v_end_date := _end_date::DATE;
  ELSIF _anchor_to_latest THEN
    -- Find the most recent transaction date for this workspace and transaction type
    SELECT MAX(wt.taken_at::DATE) INTO v_latest_date
    FROM wallet_transactions wt
    JOIN workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE ww.ws_id = _ws_id
      AND (
        (_transaction_type = 'expense' AND wt.amount < 0)
        OR (_transaction_type = 'income' AND wt.amount > 0)
        OR (_transaction_type = 'all')
      )
      AND (
        (NOT include_confidential AND NOT wt.is_amount_confidential)
        OR
        (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
      );

    -- Use latest transaction date, or fall back to current date if no transactions
    v_end_date := COALESCE(v_latest_date, CURRENT_DATE);
  ELSE
    v_end_date := CURRENT_DATE;
  END IF;

  -- Calculate start date based on interval
  v_start_date := COALESCE(_start_date::DATE,
    CASE v_interval
      WHEN 'day' THEN v_end_date - INTERVAL '30 days'
      WHEN 'week' THEN v_end_date - INTERVAL '12 weeks'
      WHEN 'month' THEN v_end_date - INTERVAL '11 months'
      WHEN 'year' THEN v_end_date - INTERVAL '4 years'
      ELSE v_end_date - INTERVAL '11 months'
    END
  );

  RETURN QUERY
  SELECT
    date_trunc(v_interval, wt.taken_at)::DATE AS period,
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
    AND wt.taken_at::DATE >= v_start_date
    AND wt.taken_at::DATE <= v_end_date
    -- Confidential filtering
    AND (
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR
      (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    )
  GROUP BY date_trunc(v_interval, wt.taken_at), tc.id, tc.name, tc.icon, tc.color
  ORDER BY period, total DESC;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.get_category_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, BOOLEAN) IS
  'Returns category breakdown by specified interval. transaction_type can be "expense", "income", or "all". interval can be "daily", "weekly", "monthly", or "yearly". When anchor_to_latest is true, uses most recent transaction as the end date anchor.';
