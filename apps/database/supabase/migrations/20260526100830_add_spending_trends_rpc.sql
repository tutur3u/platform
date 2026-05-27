-- Aggregate daily spending trends in Postgres so the API route does not
-- fetch raw transactions and sum expenses in application code.

CREATE OR REPLACE FUNCTION public.get_spending_trends(
  _ws_id uuid,
  _days integer DEFAULT 30,
  _timezone text DEFAULT 'UTC'
)
RETURNS TABLE(
  date date,
  amount double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_timezone text;
  v_start_date date;
  v_end_date date;
  v_start_at timestamp with time zone;
  v_end_at timestamp with time zone;
  v_can_view_amount boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_transactions'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  BEGIN
    PERFORM now() AT TIME ZONE _timezone;
    v_timezone := _timezone;
  EXCEPTION WHEN OTHERS THEN
    v_timezone := 'UTC';
  END;

  v_days := LEAST(GREATEST(COALESCE(_days, 30), 1), 366);
  v_end_date := (now() AT TIME ZONE v_timezone)::date;
  v_start_date := v_end_date - (v_days - 1);
  v_start_at := v_start_date::timestamp AT TIME ZONE v_timezone;
  v_end_at := (v_end_date + 1)::timestamp AT TIME ZONE v_timezone;
  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_confidential_amount'
  );

  RETURN QUERY
  WITH day_series AS (
    SELECT generate_series(
      v_start_date,
      v_end_date,
      interval '1 day'
    )::date AS spending_date
  ),
  daily_spending AS (
    SELECT
      (wt.taken_at AT TIME ZONE v_timezone)::date AS spending_date,
      COALESCE(SUM(ABS(wt.amount)), 0)::double precision AS spending_amount
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww
      ON ww.id = wt.wallet_id
    WHERE ww.ws_id = _ws_id
      AND COALESCE(wt.amount, 0) < 0
      AND wt.taken_at >= v_start_at
      AND wt.taken_at < v_end_at
      AND (NOT wt.is_amount_confidential OR v_can_view_amount)
    GROUP BY (wt.taken_at AT TIME ZONE v_timezone)::date
  )
  SELECT
    ds.spending_date AS date,
    COALESCE(daily_spending.spending_amount, 0)::double precision AS amount
  FROM day_series ds
  LEFT JOIN daily_spending
    ON daily_spending.spending_date = ds.spending_date
  ORDER BY ds.spending_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_spending_trends(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_spending_trends(uuid, integer, text) TO authenticated;

COMMENT ON FUNCTION public.get_spending_trends(uuid, integer, text) IS
  'Returns zero-filled daily expense totals for a workspace, grouped in the requested timezone and excluding confidential amounts unless the caller can view them.';
