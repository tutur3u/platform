-- Migration: Add invoice analytics RPC functions
-- Provides daily, weekly, and monthly invoice totals with wallet breakdown

-- ============================================================================
-- FUNCTION: get_daily_invoice_totals
-- Returns daily invoice totals grouped by wallet for the past N days
-- ============================================================================
CREATE OR REPLACE FUNCTION get_daily_invoice_totals(
  _ws_id UUID,
  past_days INT DEFAULT 14,
  wallet_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
  period DATE,
  wallet_id UUID,
  wallet_name TEXT,
  total_amount NUMERIC,
  invoice_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (past_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::DATE AS day
  ),
  relevant_wallets AS (
    SELECT ww.id, ww.name
    FROM workspace_wallets ww
    WHERE ww.ws_id = _ws_id
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR ww.id = ANY(wallet_ids))
  ),
  date_wallet_combinations AS (
    SELECT ds.day, rw.id AS wallet_id, rw.name AS wallet_name
    FROM date_series ds
    CROSS JOIN relevant_wallets rw
  ),
  daily_invoices AS (
    SELECT
      date_trunc('day', fi.created_at)::DATE AS day,
      wt.wallet_id,
      SUM(fi.price)::NUMERIC AS total_amount,
      COUNT(*)::BIGINT AS invoice_count
    FROM finance_invoices fi
    INNER JOIN wallet_transactions wt ON fi.transaction_id = wt.id
    INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE fi.ws_id = _ws_id
      AND fi.created_at::DATE >= CURRENT_DATE - (past_days - 1)
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
    GROUP BY date_trunc('day', fi.created_at)::DATE, wt.wallet_id
  )
  SELECT
    dwc.day AS period,
    dwc.wallet_id,
    dwc.wallet_name,
    COALESCE(di.total_amount, 0)::NUMERIC AS total_amount,
    COALESCE(di.invoice_count, 0)::BIGINT AS invoice_count
  FROM date_wallet_combinations dwc
  LEFT JOIN daily_invoices di ON dwc.day = di.day AND dwc.wallet_id = di.wallet_id
  ORDER BY dwc.day, dwc.wallet_name;
END;
$$;

-- ============================================================================
-- FUNCTION: get_weekly_invoice_totals
-- Returns weekly invoice totals grouped by wallet for the past N weeks
-- ============================================================================
CREATE OR REPLACE FUNCTION get_weekly_invoice_totals(
  _ws_id UUID,
  past_weeks INT DEFAULT 12,
  wallet_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
  period DATE,
  wallet_id UUID,
  wallet_name TEXT,
  total_amount NUMERIC,
  invoice_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH week_series AS (
    SELECT generate_series(
      date_trunc('week', CURRENT_DATE) - INTERVAL '1 week' * (past_weeks - 1),
      date_trunc('week', CURRENT_DATE),
      '1 week'::interval
    )::DATE AS week_start
  ),
  relevant_wallets AS (
    SELECT ww.id, ww.name
    FROM workspace_wallets ww
    WHERE ww.ws_id = _ws_id
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR ww.id = ANY(wallet_ids))
  ),
  week_wallet_combinations AS (
    SELECT ws.week_start, rw.id AS wallet_id, rw.name AS wallet_name
    FROM week_series ws
    CROSS JOIN relevant_wallets rw
  ),
  weekly_invoices AS (
    SELECT
      date_trunc('week', fi.created_at)::DATE AS week_start,
      wt.wallet_id,
      SUM(fi.price)::NUMERIC AS total_amount,
      COUNT(*)::BIGINT AS invoice_count
    FROM finance_invoices fi
    INNER JOIN wallet_transactions wt ON fi.transaction_id = wt.id
    INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE fi.ws_id = _ws_id
      AND fi.created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '1 week' * (past_weeks - 1)
      AND fi.created_at < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
    GROUP BY date_trunc('week', fi.created_at)::DATE, wt.wallet_id
  )
  SELECT
    wwc.week_start AS period,
    wwc.wallet_id,
    wwc.wallet_name,
    COALESCE(wi.total_amount, 0)::NUMERIC AS total_amount,
    COALESCE(wi.invoice_count, 0)::BIGINT AS invoice_count
  FROM week_wallet_combinations wwc
  LEFT JOIN weekly_invoices wi ON wwc.week_start = wi.week_start AND wwc.wallet_id = wi.wallet_id
  ORDER BY wwc.week_start, wwc.wallet_name;
END;
$$;

-- ============================================================================
-- FUNCTION: get_monthly_invoice_totals
-- Returns monthly invoice totals grouped by wallet for the past N months
-- ============================================================================
CREATE OR REPLACE FUNCTION get_monthly_invoice_totals(
  _ws_id UUID,
  past_months INT DEFAULT 12,
  wallet_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
  period DATE,
  wallet_id UUID,
  wallet_name TEXT,
  total_amount NUMERIC,
  invoice_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH month_series AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1),
      date_trunc('month', CURRENT_DATE),
      '1 month'::interval
    )::DATE AS month_start
  ),
  relevant_wallets AS (
    SELECT ww.id, ww.name
    FROM workspace_wallets ww
    WHERE ww.ws_id = _ws_id
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR ww.id = ANY(wallet_ids))
  ),
  month_wallet_combinations AS (
    SELECT ms.month_start, rw.id AS wallet_id, rw.name AS wallet_name
    FROM month_series ms
    CROSS JOIN relevant_wallets rw
  ),
  monthly_invoices AS (
    SELECT
      date_trunc('month', fi.created_at)::DATE AS month_start,
      wt.wallet_id,
      SUM(fi.price)::NUMERIC AS total_amount,
      COUNT(*)::BIGINT AS invoice_count
    FROM finance_invoices fi
    INNER JOIN wallet_transactions wt ON fi.transaction_id = wt.id
    INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE fi.ws_id = _ws_id
      AND fi.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1)
      AND fi.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
    GROUP BY date_trunc('month', fi.created_at)::DATE, wt.wallet_id
  )
  SELECT
    mwc.month_start AS period,
    mwc.wallet_id,
    mwc.wallet_name,
    COALESCE(mi.total_amount, 0)::NUMERIC AS total_amount,
    COALESCE(mi.invoice_count, 0)::BIGINT AS invoice_count
  FROM month_wallet_combinations mwc
  LEFT JOIN monthly_invoices mi ON mwc.month_start = mi.month_start AND mwc.wallet_id = mi.wallet_id
  ORDER BY mwc.month_start, mwc.wallet_name;
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_daily_invoice_totals(UUID, INT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_invoice_totals(UUID, INT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_invoice_totals(UUID, INT, UUID[]) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION get_daily_invoice_totals(UUID, INT, UUID[]) IS
  'Returns daily invoice totals grouped by wallet. Pass wallet_ids array to filter by specific wallets, or NULL/empty for all wallets.';

COMMENT ON FUNCTION get_weekly_invoice_totals(UUID, INT, UUID[]) IS
  'Returns weekly invoice totals grouped by wallet. Pass wallet_ids array to filter by specific wallets, or NULL/empty for all wallets.';

COMMENT ON FUNCTION get_monthly_invoice_totals(UUID, INT, UUID[]) IS
  'Returns monthly invoice totals grouped by wallet. Pass wallet_ids array to filter by specific wallets, or NULL/empty for all wallets.';
