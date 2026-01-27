CREATE OR REPLACE FUNCTION public.get_invoice_totals_by_date_range(
  _ws_id uuid,
  start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  wallet_ids uuid[] DEFAULT NULL::uuid[],
  user_ids uuid[] DEFAULT NULL::uuid[],
  group_by_creator boolean DEFAULT false,
  week_start_day integer DEFAULT 1,
  interval_type text DEFAULT NULL::text
)
 RETURNS TABLE(
  period date,
  group_id uuid,
  group_name text,
  group_avatar_url text,
  total_amount numeric,
  invoice_count bigint
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
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
        AND (
          user_ids IS NULL OR array_length(user_ids, 1) IS NULL
          OR fi.creator_id = ANY(user_ids)
          OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
        )
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
        AND (
          user_ids IS NULL OR array_length(user_ids, 1) IS NULL
          OR fi.creator_id = ANY(user_ids)
          OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
        )
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
        AND (
          user_ids IS NULL OR array_length(user_ids, 1) IS NULL
          OR fi.creator_id = ANY(user_ids)
          OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
        )
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
$function$;

CREATE OR REPLACE FUNCTION public.get_daily_invoice_totals(
  _ws_id uuid,
  past_days integer DEFAULT 14,
  wallet_ids uuid[] DEFAULT NULL::uuid[],
  user_ids uuid[] DEFAULT NULL::uuid[],
  start_date date DEFAULT NULL::date,
  end_date date DEFAULT NULL::date
)
 RETURNS TABLE(
  period date,
  wallet_id uuid,
  wallet_name text,
  total_amount numeric,
  invoice_count bigint
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF start_date IS NOT NULL AND end_date IS NOT NULL THEN
    _start_date := start_date;
    _end_date := end_date;
  ELSE
    _end_date := CURRENT_DATE;
    _start_date := _end_date - (past_days - 1);
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(_start_date, _end_date, '1 day'::interval)::DATE AS day
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
    LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
    WHERE fi.ws_id = _ws_id
      AND fi.created_at::DATE >= _start_date
      AND fi.created_at::DATE <= _end_date
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
      AND (
        user_ids IS NULL OR array_length(user_ids, 1) IS NULL
        OR fi.creator_id = ANY(user_ids)
        OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
      )
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
$function$;

CREATE OR REPLACE FUNCTION public.get_weekly_invoice_totals(
  _ws_id uuid,
  past_weeks integer DEFAULT 12,
  wallet_ids uuid[] DEFAULT NULL::uuid[],
  user_ids uuid[] DEFAULT NULL::uuid[],
  start_date date DEFAULT NULL::date,
  end_date date DEFAULT NULL::date
)
 RETURNS TABLE(
  period date,
  wallet_id uuid,
  wallet_name text,
  total_amount numeric,
  invoice_count bigint
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF start_date IS NOT NULL AND end_date IS NOT NULL THEN
    _start_date := date_trunc('week', start_date::TIMESTAMP)::DATE;
    _end_date := end_date;
  ELSE
    _end_date := CURRENT_DATE;
    _start_date := (date_trunc('week', CURRENT_DATE) - INTERVAL '1 week' * (past_weeks - 1))::DATE;
  END IF;

  RETURN QUERY
  WITH week_series AS (
    SELECT generate_series(
      date_trunc('week', _start_date::TIMESTAMP),
      date_trunc('week', _end_date::TIMESTAMP),
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
    LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
    WHERE fi.ws_id = _ws_id
      AND fi.created_at >= _start_date
      AND fi.created_at < _end_date + INTERVAL '1 day'
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
      AND (
        user_ids IS NULL OR array_length(user_ids, 1) IS NULL
        OR fi.creator_id = ANY(user_ids)
        OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
      )
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
$function$;

CREATE OR REPLACE FUNCTION public.get_weekly_invoice_totals(
  _ws_id uuid,
  past_weeks integer DEFAULT 12,
  wallet_ids uuid[] DEFAULT NULL::uuid[],
  user_ids uuid[] DEFAULT NULL::uuid[],
  start_date date DEFAULT NULL::date,
  end_date date DEFAULT NULL::date,
  week_start_day integer DEFAULT 1
)
 RETURNS TABLE(
  period date,
  wallet_id uuid,
  wallet_name text,
  total_amount numeric,
  invoice_count bigint
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF start_date IS NOT NULL AND end_date IS NOT NULL THEN
    _start_date := trunc_to_week_start(start_date::TIMESTAMPTZ, week_start_day);
    _end_date := end_date;
  ELSE
    _end_date := CURRENT_DATE;
    _start_date := trunc_to_week_start(CURRENT_DATE::TIMESTAMPTZ, week_start_day) - ((past_weeks - 1) * 7);
  END IF;

  RETURN QUERY
  WITH week_series AS (
    SELECT generate_series(
      trunc_to_week_start(_start_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ,
      trunc_to_week_start(_end_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ,
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
      AND (
        user_ids IS NULL OR array_length(user_ids, 1) IS NULL
        OR fi.creator_id = ANY(user_ids)
        OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
      )
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
$function$;

CREATE OR REPLACE FUNCTION public.get_monthly_invoice_totals(
  _ws_id uuid,
  past_months integer DEFAULT 12,
  wallet_ids uuid[] DEFAULT NULL::uuid[],
  user_ids uuid[] DEFAULT NULL::uuid[],
  start_date date DEFAULT NULL::date,
  end_date date DEFAULT NULL::date
)
 RETURNS TABLE(
  period date,
  wallet_id uuid,
  wallet_name text,
  total_amount numeric,
  invoice_count bigint
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF start_date IS NOT NULL AND end_date IS NOT NULL THEN
    _start_date := date_trunc('month', start_date::TIMESTAMP)::DATE;
    _end_date := end_date;
  ELSE
    _end_date := CURRENT_DATE;
    _start_date := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1))::DATE;
  END IF;

  RETURN QUERY
  WITH month_series AS (
    SELECT generate_series(
      date_trunc('month', _start_date::TIMESTAMP),
      date_trunc('month', _end_date::TIMESTAMP),
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
    LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
    WHERE fi.ws_id = _ws_id
      AND fi.created_at >= _start_date
      AND fi.created_at < _end_date + INTERVAL '1 day'
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
      AND (
        user_ids IS NULL OR array_length(user_ids, 1) IS NULL
        OR fi.creator_id = ANY(user_ids)
        OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
      )
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
$function$;