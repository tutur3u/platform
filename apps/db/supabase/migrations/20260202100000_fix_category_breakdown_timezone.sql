-- Migration: Fix get_category_breakdown timezone handling
-- The previous implementation used ::DATE truncation which happens in UTC,
-- causing incorrect date range filtering for non-UTC timezones.
-- This fix adds a _timezone parameter and uses proper timestamp comparison.

CREATE OR REPLACE FUNCTION public.get_category_breakdown(
  _ws_id UUID,
  _start_date TIMESTAMPTZ DEFAULT NULL,
  _end_date TIMESTAMPTZ DEFAULT NULL,
  include_confidential BOOLEAN DEFAULT TRUE,
  _transaction_type TEXT DEFAULT 'expense',  -- 'expense', 'income', or 'all'
  _interval TEXT DEFAULT 'monthly',  -- 'daily', 'weekly', 'monthly', or 'yearly'
  _anchor_to_latest BOOLEAN DEFAULT FALSE,  -- When true, anchors to most recent transaction
  _timezone TEXT DEFAULT 'UTC'  -- IANA timezone identifier for date grouping
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
  v_start_ts TIMESTAMPTZ;
  v_end_ts TIMESTAMPTZ;
  v_interval TEXT;
  v_latest_ts TIMESTAMPTZ;
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

  -- Determine end timestamp
  IF _end_date IS NOT NULL THEN
    v_end_ts := _end_date;
  ELSIF _anchor_to_latest THEN
    -- Find the most recent transaction timestamp for this workspace and transaction type
    SELECT MAX(wt.taken_at) INTO v_latest_ts
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

    -- Use latest transaction timestamp, or fall back to end of current day in the specified timezone
    v_end_ts := COALESCE(
      v_latest_ts,
      (date_trunc('day', NOW() AT TIME ZONE _timezone) + INTERVAL '1 day - 1 microsecond') AT TIME ZONE _timezone
    );
  ELSE
    -- Default to end of current day in the specified timezone
    v_end_ts := (date_trunc('day', NOW() AT TIME ZONE _timezone) + INTERVAL '1 day - 1 microsecond') AT TIME ZONE _timezone;
  END IF;

  -- Calculate start timestamp based on interval
  IF _start_date IS NOT NULL THEN
    v_start_ts := _start_date;
  ELSE
    v_start_ts := CASE v_interval
      WHEN 'day' THEN v_end_ts - INTERVAL '30 days'
      WHEN 'week' THEN v_end_ts - INTERVAL '12 weeks'
      WHEN 'month' THEN v_end_ts - INTERVAL '11 months'
      WHEN 'year' THEN v_end_ts - INTERVAL '4 years'
      ELSE v_end_ts - INTERVAL '11 months'
    END;
  END IF;

  RETURN QUERY
  SELECT
    -- Group by date in the user's timezone
    (date_trunc(v_interval, wt.taken_at AT TIME ZONE _timezone))::DATE AS period,
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
    -- Use proper timestamp comparison instead of DATE truncation
    AND wt.taken_at >= v_start_ts
    AND wt.taken_at <= v_end_ts
    -- Confidential filtering
    AND (
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR
      (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    )
  GROUP BY date_trunc(v_interval, wt.taken_at AT TIME ZONE _timezone), tc.id, tc.name, tc.icon, tc.color
  ORDER BY period, total DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_category_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- Update comment
COMMENT ON FUNCTION public.get_category_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT) IS
  'Returns category breakdown by specified interval with timezone support. transaction_type can be "expense", "income", or "all". interval can be "daily", "weekly", "monthly", or "yearly". When anchor_to_latest is true, uses most recent transaction as the end date anchor. timezone parameter specifies the IANA timezone for date grouping (default: UTC).';
