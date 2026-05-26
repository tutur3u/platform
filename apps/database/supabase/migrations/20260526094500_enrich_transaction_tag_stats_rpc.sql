-- Enrich transaction tag stats in Postgres so API routes do not calculate
-- totals or recent pace in backend application code.

DROP FUNCTION IF EXISTS public.get_transaction_count_by_tag(uuid);

CREATE OR REPLACE FUNCTION public.get_transaction_count_by_tag(_ws_id uuid)
RETURNS TABLE(
  tag_id uuid,
  tag_name text,
  tag_color text,
  transaction_count bigint,
  income_count bigint,
  expense_count bigint,
  total_income double precision,
  total_expense double precision,
  net_total double precision,
  recent_transaction_count bigint,
  recent_income_count bigint,
  recent_expense_count bigint,
  recent_total_income double precision,
  recent_total_expense double precision,
  last_transaction_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'manage_finance'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    tt.id AS tag_id,
    tt.name AS tag_name,
    tt.color AS tag_color,
    COUNT(wt.id) FILTER (
      WHERE ww.id IS NOT NULL
    ) AS transaction_count,
    COUNT(wt.id) FILTER (
      WHERE ww.id IS NOT NULL
        AND COALESCE(wt.amount, 0) > 0
    ) AS income_count,
    COUNT(wt.id) FILTER (
      WHERE ww.id IS NOT NULL
        AND COALESCE(wt.amount, 0) < 0
    ) AS expense_count,
    COALESCE(SUM(wt.amount) FILTER (
      WHERE ww.id IS NOT NULL
        AND COALESCE(wt.amount, 0) > 0
    ), 0)::double precision AS total_income,
    COALESCE(SUM(ABS(wt.amount)) FILTER (
      WHERE ww.id IS NOT NULL
        AND COALESCE(wt.amount, 0) < 0
    ), 0)::double precision AS total_expense,
    COALESCE(SUM(wt.amount) FILTER (
      WHERE ww.id IS NOT NULL
    ), 0)::double precision AS net_total,
    COUNT(wt.id) FILTER (
      WHERE ww.id IS NOT NULL
        AND wt.taken_at >= now() - interval '30 days'
    ) AS recent_transaction_count,
    COUNT(wt.id) FILTER (
      WHERE ww.id IS NOT NULL
        AND wt.taken_at >= now() - interval '30 days'
        AND COALESCE(wt.amount, 0) > 0
    ) AS recent_income_count,
    COUNT(wt.id) FILTER (
      WHERE ww.id IS NOT NULL
        AND wt.taken_at >= now() - interval '30 days'
        AND COALESCE(wt.amount, 0) < 0
    ) AS recent_expense_count,
    COALESCE(SUM(wt.amount) FILTER (
      WHERE ww.id IS NOT NULL
        AND wt.taken_at >= now() - interval '30 days'
        AND COALESCE(wt.amount, 0) > 0
    ), 0)::double precision AS recent_total_income,
    COALESCE(SUM(ABS(wt.amount)) FILTER (
      WHERE ww.id IS NOT NULL
        AND wt.taken_at >= now() - interval '30 days'
        AND COALESCE(wt.amount, 0) < 0
    ), 0)::double precision AS recent_total_expense,
    MAX(wt.taken_at) FILTER (
      WHERE ww.id IS NOT NULL
    ) AS last_transaction_at
  FROM public.transaction_tags tt
  LEFT JOIN public.wallet_transaction_tags wtt
    ON wtt.tag_id = tt.id
  LEFT JOIN public.wallet_transactions wt
    ON wt.id = wtt.transaction_id
  LEFT JOIN public.workspace_wallets ww
    ON ww.id = wt.wallet_id
   AND ww.ws_id = _ws_id
  WHERE tt.ws_id = _ws_id
  GROUP BY tt.id, tt.name, tt.color
  ORDER BY transaction_count DESC, tt.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_transaction_count_by_tag(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_transaction_count_by_tag(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_transaction_count_by_tag(uuid) IS
  'Returns transaction tag counts, income, expense, net totals, recent 30-day pace, and last activity for finance tag dashboards.';
