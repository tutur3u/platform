-- Migration: Add interval_type parameter to invoice analytics RPC functions
-- This allows explicit control over the granularity (day/week/month) regardless of date range duration.

-- ============================================================================
-- FUNCTION: get_invoice_totals_by_date_range (updated with interval_type)
-- ============================================================================

-- Drop the old get_invoice_totals_by_date_range without week_start_day parameter
DROP FUNCTION IF EXISTS get_invoice_totals_by_date_range(UUID, DATE, DATE, UUID[], UUID[], BOOLEAN);

CREATE OR REPLACE FUNCTION get_invoice_totals_by_date_range(
  _ws_id UUID,
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL,
  wallet_ids UUID[] DEFAULT NULL,
  user_ids UUID[] DEFAULT NULL,
  group_by_creator BOOLEAN DEFAULT FALSE,
  week_start_day INT DEFAULT 1,  -- 0=Sunday, 1=Monday, 6=Saturday
  interval_type TEXT DEFAULT NULL -- 'day', 'week', 'month' or NULL (auto)
)
RETURNS TABLE(
  period DATE,
  group_id UUID,
  group_name TEXT,
  group_avatar_url TEXT,
  total_amount NUMERIC,
  invoice_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  _start_date TIMESTAMPTZ;
  _end_date TIMESTAMPTZ;
  _day_count INT;
  _interval_type TEXT;
BEGIN
  -- Default to last 14 days if no date range specified
  _end_date := COALESCE(end_date, CURRENT_DATE::TIMESTAMPTZ);
  _start_date := COALESCE(start_date, _end_date - INTERVAL '13 days');

  -- Calculate the number of days in the range (using date portion for day count)
  _day_count := (_end_date::DATE - _start_date::DATE) + 1;

  -- Determine interval type
  IF interval_type IS NOT NULL AND interval_type IN ('day', 'week', 'month') THEN
    _interval_type := interval_type;
  ELSE
    -- Auto-detect based on duration if interval_type is NULL or invalid
    IF _day_count <= 31 THEN
      _interval_type := 'day';
    ELSIF _day_count <= 90 THEN
      _interval_type := 'week';
    ELSE
      _interval_type := 'month';
    END IF;
  END IF;

  IF group_by_creator THEN
    -- Group by creator (Resolved User ID)
    RETURN QUERY
    WITH date_series AS (
      SELECT
        CASE _interval_type
          WHEN 'day' THEN gs::DATE
          WHEN 'week' THEN trunc_to_week_start(gs::TIMESTAMPTZ, week_start_day)
          WHEN 'month' THEN date_trunc('month', gs)::DATE
        END AS period_start
      FROM generate_series(
        CASE _interval_type
          WHEN 'day' THEN _start_date::TIMESTAMPTZ
          WHEN 'week' THEN trunc_to_week_start(_start_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ
          WHEN 'month' THEN date_trunc('month', _start_date::TIMESTAMPTZ)
        END,
        _end_date::TIMESTAMPTZ,
        CASE _interval_type
          WHEN 'day' THEN '1 day'::interval
          WHEN 'week' THEN '1 week'::interval
          WHEN 'month' THEN '1 month'::interval
        END
      ) AS gs
      GROUP BY 1
    ),
    relevant_creators AS (
      -- Get distinct creator IDs (resolved to Platform User ID where possible)
      SELECT DISTINCT
        COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) AS creator_id
      FROM finance_invoices fi
      LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
      WHERE fi.ws_id = _ws_id
        AND (user_ids IS NULL OR array_length(user_ids, 1) IS NULL
             OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids))
    ),
    creator_info AS (
      SELECT
        rc.creator_id,
        COALESCE(
          u.display_name,
          upd.full_name,
          wu.display_name,
          wu.full_name,
          'Unknown'
        ) AS creator_name,
        COALESCE(u.avatar_url, wu.avatar_url) AS avatar_url
      FROM relevant_creators rc
      LEFT JOIN users u ON rc.creator_id = u.id
      LEFT JOIN user_private_details upd ON u.id = upd.user_id
      LEFT JOIN workspace_users wu ON rc.creator_id = wu.id
    ),
    date_creator_combinations AS (
      SELECT ds.period_start, ci.creator_id, ci.creator_name, ci.avatar_url
      FROM date_series ds
      CROSS JOIN creator_info ci
    ),
    invoice_totals AS (
      SELECT
        CASE _interval_type
          WHEN 'day' THEN fi.created_at::DATE
          WHEN 'week' THEN trunc_to_week_start(fi.created_at, week_start_day)
          WHEN 'month' THEN date_trunc('month', fi.created_at)::DATE
        END AS period_start,
        COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) AS creator_id,
        SUM(fi.price)::NUMERIC AS total_amount,
        COUNT(*)::BIGINT AS invoice_count
      FROM finance_invoices fi
      LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
      LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
      WHERE fi.ws_id = _ws_id
        AND fi.created_at >= _start_date
        AND fi.created_at <= _end_date
        AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
        AND (user_ids IS NULL OR array_length(user_ids, 1) IS NULL
             OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids))
      GROUP BY 1, 2
    )
    SELECT
      dcc.period_start AS period,
      dcc.creator_id AS group_id,
      dcc.creator_name AS group_name,
      dcc.avatar_url AS group_avatar_url,
      COALESCE(it.total_amount, 0)::NUMERIC AS total_amount,
      COALESCE(it.invoice_count, 0)::BIGINT AS invoice_count
    FROM date_creator_combinations dcc
    LEFT JOIN invoice_totals it ON dcc.period_start = it.period_start AND dcc.creator_id IS NOT DISTINCT FROM it.creator_id
    ORDER BY dcc.period_start, dcc.creator_name;
  ELSE
    -- Group by wallet
    RETURN QUERY
    WITH date_series AS (
      SELECT
        CASE _interval_type
          WHEN 'day' THEN gs::DATE
          WHEN 'week' THEN trunc_to_week_start(gs::TIMESTAMPTZ, week_start_day)
          WHEN 'month' THEN date_trunc('month', gs)::DATE
        END AS period_start
      FROM generate_series(
        CASE _interval_type
          WHEN 'day' THEN _start_date::TIMESTAMPTZ
          WHEN 'week' THEN trunc_to_week_start(_start_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ
          WHEN 'month' THEN date_trunc('month', _start_date::TIMESTAMPTZ)
        END,
        _end_date::TIMESTAMPTZ,
        CASE _interval_type
          WHEN 'day' THEN '1 day'::interval
          WHEN 'week' THEN '1 week'::interval
          WHEN 'month' THEN '1 month'::interval
        END
      ) AS gs
      GROUP BY 1
    ),
    relevant_wallets AS (
      SELECT ww.id, ww.name
      FROM workspace_wallets ww
      WHERE ww.ws_id = _ws_id
        AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR ww.id = ANY(wallet_ids))
    ),
    date_wallet_combinations AS (
      SELECT ds.period_start, rw.id AS wallet_id, rw.name AS wallet_name
      FROM date_series ds
      CROSS JOIN relevant_wallets rw
    ),
    invoice_totals AS (
      SELECT
        CASE _interval_type
          WHEN 'day' THEN fi.created_at::DATE
          WHEN 'week' THEN trunc_to_week_start(fi.created_at, week_start_day)
          WHEN 'month' THEN date_trunc('month', fi.created_at)::DATE
        END AS period_start,
        wt.wallet_id,
        SUM(fi.price)::NUMERIC AS total_amount,
        COUNT(*)::BIGINT AS invoice_count
      FROM finance_invoices fi
      -- Use LEFT JOIN to consistently include invoices even if they lack linked transactions/wallets
      LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
      LEFT JOIN workspace_wallets ww ON wt.wallet_id = ww.id
      LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
      WHERE fi.ws_id = _ws_id
        AND fi.created_at >= _start_date
        AND fi.created_at <= _end_date
        AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
        AND (user_ids IS NULL OR array_length(user_ids, 1) IS NULL
             OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids))
      GROUP BY 1, 2
    )
    SELECT
      dwc.period_start AS period,
      dwc.wallet_id AS group_id,
      dwc.wallet_name AS group_name,
      NULL::TEXT AS group_avatar_url,
      COALESCE(it.total_amount, 0)::NUMERIC AS total_amount,
      COALESCE(it.invoice_count, 0)::BIGINT AS invoice_count
    FROM date_wallet_combinations dwc
    LEFT JOIN invoice_totals it ON dwc.period_start = it.period_start AND dwc.wallet_id = it.wallet_id
    ORDER BY dwc.period_start, dwc.wallet_name;
  END IF;
END;
$$