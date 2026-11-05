-- Computation rollback only: a full security reversal is unsafe.
-- Invoice analytics remain service-role only, including the internal role guard.
-- Transaction-stat actor checks and cached tenant-correct totals are retained.
DROP TRIGGER validate_finance_budget_references ON public.finance_budgets;
DROP FUNCTION public.validate_finance_budget_references();
CREATE OR REPLACE FUNCTION public.get_daily_invoice_totals(_ws_id uuid, past_days integer DEFAULT 14, wallet_ids uuid[] DEFAULT NULL::uuid[], user_ids uuid[] DEFAULT NULL::uuid[], start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(period date, wallet_id uuid, wallet_name text, total_amount numeric, invoice_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

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
    LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
    LEFT JOIN workspace_wallets ww ON wt.wallet_id = ww.id
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
$function$
;
REVOKE ALL ON FUNCTION public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date) TO service_role;
CREATE OR REPLACE FUNCTION public.get_monthly_invoice_totals(_ws_id uuid, past_months integer DEFAULT 12, wallet_ids uuid[] DEFAULT NULL::uuid[], user_ids uuid[] DEFAULT NULL::uuid[], start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(period date, wallet_id uuid, wallet_name text, total_amount numeric, invoice_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

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
    LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
    LEFT JOIN workspace_wallets ww ON wt.wallet_id = ww.id
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
$function$
;
REVOKE ALL ON FUNCTION public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date) TO service_role;
-- Retain the hardened transaction-stat actor checks; reversing them permits actor spoofing.
CREATE OR REPLACE FUNCTION public.get_weekly_invoice_totals(_ws_id uuid, past_weeks integer DEFAULT 12, wallet_ids uuid[] DEFAULT NULL::uuid[], user_ids uuid[] DEFAULT NULL::uuid[], start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(period date, wallet_id uuid, wallet_name text, total_amount numeric, invoice_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

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
    LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
    LEFT JOIN workspace_wallets ww ON wt.wallet_id = ww.id
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
$function$
;
REVOKE ALL ON FUNCTION public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date) TO service_role;
CREATE OR REPLACE FUNCTION public.get_weekly_invoice_totals(_ws_id uuid, past_weeks integer DEFAULT 12, wallet_ids uuid[] DEFAULT NULL::uuid[], user_ids uuid[] DEFAULT NULL::uuid[], start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date, week_start_day integer DEFAULT 1)
 RETURNS TABLE(period date, wallet_id uuid, wallet_name text, total_amount numeric, invoice_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

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
    LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
    LEFT JOIN workspace_wallets ww ON wt.wallet_id = ww.id
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
$function$
;
REVOKE ALL ON FUNCTION public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.update_budget_spent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
DECLARE
    budget_record RECORD;
BEGIN
    -- Find all active budgets that might be affected
    FOR budget_record IN
        SELECT fb.id, fb.start_date, fb.end_date, fb.category_id, fb.wallet_id
        FROM finance_budgets fb
        JOIN workspace_wallets ww ON (fb.wallet_id IS NULL OR fb.wallet_id = ww.id)
        WHERE fb.is_active = true
        AND ww.ws_id = (
            SELECT ws_id FROM workspace_wallets WHERE id = COALESCE(NEW.wallet_id, OLD.wallet_id)
        )
    LOOP
        -- Calculate spent amount for this budget
        UPDATE finance_budgets
        SET spent = (
            SELECT COALESCE(ABS(SUM(wt.amount)), 0)
            FROM wallet_transactions wt
            WHERE wt.amount < 0 -- Only expenses
            AND wt.taken_at::date >= budget_record.start_date
            AND (budget_record.end_date IS NULL OR wt.taken_at::date <= budget_record.end_date)
            AND (budget_record.category_id IS NULL OR wt.category_id = budget_record.category_id)
            AND (budget_record.wallet_id IS NULL OR wt.wallet_id = budget_record.wallet_id)
        ),
        updated_at = now()
        WHERE id = budget_record.id;
    END LOOP;

    RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION public.update_budget_spent() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_budget_spent() TO service_role;
