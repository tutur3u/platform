-- Migration: Add week_start_day parameter to invoice analytics RPC functions
-- This allows the frontend to respect the user's "first day of week" preference
-- when calculating weekly groupings.
--
-- week_start_day values (JavaScript convention):
--   0 = Sunday
--   1 = Monday (default, matches PostgreSQL ISO standard)
--   6 = Saturday
--
-- PostgreSQL date_trunc('week', ...) always uses Monday as week start (ISO 8601).
-- To support other week starts, we use custom truncation logic.

-- ============================================================================
-- Helper function: Truncate date to week start based on custom week_start_day
-- ============================================================================
CREATE OR REPLACE FUNCTION trunc_to_week_start(
  input_date TIMESTAMP,
  week_start_day INT DEFAULT 1  -- 0=Sunday, 1=Monday, 6=Saturday
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  dow INT;
  days_to_subtract INT;
BEGIN
  -- PostgreSQL EXTRACT(DOW FROM ...) returns 0=Sunday, 1=Monday, ..., 6=Saturday
  dow := EXTRACT(DOW FROM input_date)::INT;
  
  -- Calculate days to subtract to get to the week start
  -- Formula: (dow - week_start_day + 7) % 7
  days_to_subtract := ((dow - week_start_day + 7) % 7);
  
  RETURN (input_date - (days_to_subtract || ' days')::INTERVAL)::DATE;
END;
$$;

-- ============================================================================
-- FUNCTION: get_invoice_totals_by_date_range (updated with week_start_day)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_invoice_totals_by_date_range(
  _ws_id UUID,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  wallet_ids UUID[] DEFAULT NULL,
  user_ids UUID[] DEFAULT NULL,
  group_by_creator BOOLEAN DEFAULT FALSE,
  week_start_day INT DEFAULT 1  -- 0=Sunday, 1=Monday, 6=Saturday
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
  _start_date DATE;
  _end_date DATE;
  _day_count INT;
  _interval_type TEXT;
BEGIN
  -- Default to last 14 days if no date range specified
  _end_date := COALESCE(end_date, CURRENT_DATE);
  _start_date := COALESCE(start_date, _end_date - INTERVAL '13 days');
  
  -- Calculate the number of days in the range
  _day_count := _end_date - _start_date + 1;
  
  -- Determine interval type based on date range
  IF _day_count <= 31 THEN
    _interval_type := 'day';
  ELSIF _day_count <= 90 THEN
    _interval_type := 'week';
  ELSE
    _interval_type := 'month';
  END IF;

  IF group_by_creator THEN
    -- Group by creator (Resolved User ID)
    RETURN QUERY
    WITH date_series AS (
      SELECT 
        CASE _interval_type
          WHEN 'day' THEN gs::DATE
          WHEN 'week' THEN trunc_to_week_start(gs, week_start_day)
          WHEN 'month' THEN date_trunc('month', gs)::DATE
        END AS period_start
      FROM generate_series(
        CASE _interval_type
          WHEN 'day' THEN _start_date
          WHEN 'week' THEN trunc_to_week_start(_start_date::TIMESTAMP, week_start_day)
          WHEN 'month' THEN date_trunc('month', _start_date::TIMESTAMP)::DATE
        END,
        _end_date,
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
        AND fi.created_at::DATE >= _start_date
        AND fi.created_at::DATE <= _end_date
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
          WHEN 'week' THEN trunc_to_week_start(gs, week_start_day)
          WHEN 'month' THEN date_trunc('month', gs)::DATE
        END AS period_start
      FROM generate_series(
        CASE _interval_type
          WHEN 'day' THEN _start_date
          WHEN 'week' THEN trunc_to_week_start(_start_date::TIMESTAMP, week_start_day)
          WHEN 'month' THEN date_trunc('month', _start_date::TIMESTAMP)::DATE
        END,
        _end_date,
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
      INNER JOIN wallet_transactions wt ON fi.transaction_id = wt.id
      INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
      LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
      WHERE fi.ws_id = _ws_id
        AND fi.created_at::DATE >= _start_date
        AND fi.created_at::DATE <= _end_date
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
$$;

-- ============================================================================
-- FUNCTION: get_weekly_invoice_totals (updated with week_start_day)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_weekly_invoice_totals(
  _ws_id UUID,
  past_weeks INT DEFAULT 12,
  wallet_ids UUID[] DEFAULT NULL,
  user_ids UUID[] DEFAULT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  week_start_day INT DEFAULT 1  -- 0=Sunday, 1=Monday, 6=Saturday
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
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF start_date IS NOT NULL AND end_date IS NOT NULL THEN
    _start_date := trunc_to_week_start(start_date::TIMESTAMP, week_start_day);
    _end_date := end_date;
  ELSE
    _end_date := CURRENT_DATE;
    _start_date := trunc_to_week_start(CURRENT_DATE::TIMESTAMP, week_start_day) - ((past_weeks - 1) * 7);
  END IF;

  RETURN QUERY
  WITH week_series AS (
    SELECT generate_series(
      trunc_to_week_start(_start_date::TIMESTAMP, week_start_day)::TIMESTAMP,
      trunc_to_week_start(_end_date::TIMESTAMP, week_start_day)::TIMESTAMP,
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
      trunc_to_week_start(fi.created_at, week_start_day) AS week_start,
      wt.wallet_id,
      SUM(fi.price)::NUMERIC AS total_amount,
      COUNT(*)::BIGINT AS invoice_count
    FROM finance_invoices fi
    INNER JOIN wallet_transactions wt ON fi.transaction_id = wt.id
    INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
    LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
    WHERE fi.ws_id = _ws_id
      AND fi.created_at >= _start_date
      AND fi.created_at < _end_date + INTERVAL '1 day'
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
      AND (user_ids IS NULL OR array_length(user_ids, 1) IS NULL 
           OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids))
    GROUP BY trunc_to_week_start(fi.created_at, week_start_day), wt.wallet_id
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
