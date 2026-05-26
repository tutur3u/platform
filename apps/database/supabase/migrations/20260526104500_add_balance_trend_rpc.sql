-- Compute sampled daily wallet closing balances in Postgres so chart routes do
-- not reconstruct running totals from multiple backend queries.

CREATE OR REPLACE FUNCTION public.get_balance_trend(
  _ws_id uuid,
  _start_date timestamp with time zone DEFAULT NULL,
  _end_date timestamp with time zone DEFAULT NULL,
  include_confidential boolean DEFAULT true,
  _max_points integer DEFAULT 60
)
RETURNS TABLE(
  date date,
  balance double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_start_at timestamp with time zone;
  v_end_at timestamp with time zone;
  v_max_points integer;
  v_can_view_amount boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_finance_stats'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_end_date := COALESCE(_end_date::date, CURRENT_DATE);
  v_start_date := COALESCE(_start_date::date, v_end_date - 29);
  v_start_at := v_start_date::timestamp with time zone;
  v_end_at := (v_end_date + 1)::timestamp with time zone;
  v_max_points := LEAST(GREATEST(COALESCE(_max_points, 60), 1), 366);
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
    )::date AS balance_date
  ),
  opening_balance AS (
    SELECT COALESCE(SUM(wt.amount), 0)::numeric AS amount
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww
      ON ww.id = wt.wallet_id
    WHERE ww.ws_id = _ws_id
      AND wt.taken_at < v_start_at
      AND (
        (NOT include_confidential AND NOT wt.is_amount_confidential)
        OR (
          include_confidential
          AND (NOT wt.is_amount_confidential OR v_can_view_amount)
        )
      )
  ),
  daily_deltas AS (
    SELECT
      wt.taken_at::date AS balance_date,
      COALESCE(SUM(wt.amount), 0)::numeric AS amount
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww
      ON ww.id = wt.wallet_id
    WHERE ww.ws_id = _ws_id
      AND wt.taken_at >= v_start_at
      AND wt.taken_at < v_end_at
      AND (
        (NOT include_confidential AND NOT wt.is_amount_confidential)
        OR (
          include_confidential
          AND (NOT wt.is_amount_confidential OR v_can_view_amount)
        )
      )
    GROUP BY wt.taken_at::date
  ),
  running_balances AS (
    SELECT
      ds.balance_date,
      (
        ob.amount
        + SUM(COALESCE(dd.amount, 0)) OVER (ORDER BY ds.balance_date)
      )::double precision AS balance,
      ROW_NUMBER() OVER (ORDER BY ds.balance_date) AS row_number,
      COUNT(*) OVER () AS total_count
    FROM day_series ds
    CROSS JOIN opening_balance ob
    LEFT JOIN daily_deltas dd
      ON dd.balance_date = ds.balance_date
  )
  SELECT
    rb.balance_date AS date,
    rb.balance
  FROM running_balances rb
  WHERE rb.total_count <= v_max_points
    OR rb.row_number = rb.total_count
    OR (rb.row_number - 1) % CEIL(
      rb.total_count::numeric / v_max_points
    )::integer = 0
  ORDER BY rb.balance_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_balance_trend(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) FROM public;
GRANT EXECUTE ON FUNCTION public.get_balance_trend(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) TO authenticated;

COMMENT ON FUNCTION public.get_balance_trend(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) IS
  'Returns sampled daily wallet closing balances for a workspace date range, respecting finance stats and confidential amount permissions.';
