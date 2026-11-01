BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s'; -- Finance workspace ownership and permission parity.
CREATE OR REPLACE FUNCTION public.get_transaction_stats(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_wallet_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_creator_ids uuid[] DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_transaction_type text DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  total_transactions bigint,
  total_income numeric,
  total_expense numeric,
  net_total numeric,
  has_redacted_amounts boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_can_view_transactions boolean;
  v_can_view_expenses boolean;
  v_can_view_incomes boolean;
  v_can_view_amount boolean;
  v_has_manage_finance boolean;
  v_has_granular_permissions boolean;
  v_allowed_wallet_ids uuid[];
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
    AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR NOT (
    public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions') OR
    public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes') OR
    public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses') OR
    public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance')
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_transaction_type NOT IN ('income', 'expense') THEN
    p_transaction_type := NULL;
  END IF;

  v_can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  v_can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  v_can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  v_can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  v_has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');
  v_has_granular_permissions := v_can_view_expenses OR v_can_view_incomes;

  IF NOT v_has_manage_finance THEN
    SELECT array_agg(DISTINCT wrww.wallet_id)
    INTO v_allowed_wallet_ids
    FROM public.workspace_role_wallet_whitelist wrww
    JOIN public.workspace_role_members wrm ON wrm.role_id = wrww.role_id
    JOIN public.workspace_roles wr ON wr.id = wrww.role_id
    WHERE wr.ws_id = p_ws_id AND wrm.user_id = p_user_id;

    IF v_allowed_wallet_ids IS NULL THEN
      RETURN QUERY SELECT 0::bigint, 0::numeric, 0::numeric, 0::numeric, false;
      RETURN;
    END IF;

    IF p_wallet_ids IS NOT NULL THEN
      p_wallet_ids := (
        SELECT array_agg(u)
        FROM unnest(p_wallet_ids) AS u
        WHERE u = ANY(v_allowed_wallet_ids)
      );
      IF p_wallet_ids IS NULL OR array_length(p_wallet_ids, 1) IS NULL THEN
        RETURN QUERY SELECT 0::bigint, 0::numeric, 0::numeric, 0::numeric, false;
        RETURN;
      END IF;
    ELSE
      p_wallet_ids := v_allowed_wallet_ids;
    END IF;
  END IF;

  RETURN QUERY
  WITH filtered_data AS (
    SELECT
      wt.amount,
      wt.is_amount_confidential
    FROM public.wallet_transactions wt
    JOIN private.workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE ww.ws_id = p_ws_id
      AND (v_has_manage_finance OR wt.wallet_id = ANY(v_allowed_wallet_ids))
      AND (
        (NOT v_has_granular_permissions AND v_can_view_transactions)
        OR (v_can_view_expenses AND wt.amount < 0)
        OR (v_can_view_incomes AND wt.amount > 0)
      )
      AND (
        p_transaction_type IS NULL
        OR (p_transaction_type = 'income' AND wt.amount > 0)
        OR (p_transaction_type = 'expense' AND wt.amount < 0)
      )
      AND (p_wallet_ids IS NULL OR wt.wallet_id = ANY(p_wallet_ids))
      AND (p_category_ids IS NULL OR wt.category_id = ANY(p_category_ids))
      AND (p_creator_ids IS NULL OR (wt.creator_id = ANY(p_creator_ids) OR wt.platform_creator_id = ANY(p_creator_ids)))
      AND (p_start_date IS NULL OR wt.taken_at >= p_start_date)
      AND (p_end_date IS NULL OR wt.taken_at <= p_end_date)
      AND (p_search_query IS NULL OR wt.description ILIKE '%' || p_search_query || '%')
      AND (p_tag_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.wallet_transaction_tags wtt
        WHERE wtt.transaction_id = wt.id AND wtt.tag_id = ANY(p_tag_ids)
      ))
  )
  SELECT
    COUNT(*) as total_transactions,
    COALESCE(SUM(CASE WHEN amount > 0 AND (NOT is_amount_confidential OR v_can_view_amount) THEN amount ELSE 0 END), 0) as total_income,
    COALESCE(SUM(CASE WHEN amount < 0 AND (NOT is_amount_confidential OR v_can_view_amount) THEN amount ELSE 0 END), 0) as total_expense,
    COALESCE(SUM(CASE WHEN NOT is_amount_confidential OR v_can_view_amount THEN amount ELSE 0 END), 0) as net_total,
    EXISTS (SELECT 1 FROM filtered_data WHERE is_amount_confidential AND NOT v_can_view_amount) as has_redacted_amounts
  FROM filtered_data;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.update_budget_spent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE public.finance_budgets fb
  SET spent = (
    SELECT COALESCE(SUM(-wt.amount), 0)
    FROM public.wallet_transactions wt
    JOIN private.workspace_wallets ww ON ww.id = wt.wallet_id AND ww.ws_id = fb.ws_id
    WHERE wt.amount < 0 AND wt.taken_at::date >= fb.start_date
      AND (fb.end_date IS NULL OR wt.taken_at::date <= fb.end_date)
      AND (fb.category_id IS NULL OR wt.category_id = fb.category_id)
      AND (fb.wallet_id IS NULL OR wt.wallet_id = fb.wallet_id)
  ), updated_at = now()
  WHERE fb.is_active AND fb.ws_id IN (
    SELECT ww.ws_id FROM private.workspace_wallets ww
    WHERE ww.id IN (NEW.wallet_id, OLD.wallet_id)
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.update_budget_spent() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.validate_finance_budget_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.wallet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.workspace_wallets ww WHERE ww.id = NEW.wallet_id AND ww.ws_id = NEW.ws_id
  ) THEN RAISE EXCEPTION 'Invalid budget wallet' USING ERRCODE = '23514'; END IF;
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transaction_categories tc WHERE tc.id = NEW.category_id AND tc.ws_id = NEW.ws_id
  ) THEN RAISE EXCEPTION 'Invalid budget category' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(SUM(-wt.amount), 0) INTO NEW.spent
  FROM public.wallet_transactions wt JOIN private.workspace_wallets ww ON ww.id = wt.wallet_id AND ww.ws_id = NEW.ws_id
  WHERE wt.amount < 0 AND wt.taken_at::date >= NEW.start_date
    AND (NEW.end_date IS NULL OR wt.taken_at::date <= NEW.end_date)
    AND (NEW.category_id IS NULL OR wt.category_id = NEW.category_id)
    AND (NEW.wallet_id IS NULL OR wt.wallet_id = NEW.wallet_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_finance_budget_references() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_finance_budget_references
BEFORE INSERT OR UPDATE OF ws_id, wallet_id, category_id, start_date, end_date ON public.finance_budgets
FOR EACH ROW EXECUTE FUNCTION public.validate_finance_budget_references();

-- Repair cached totals with the same tenant predicate, retaining configured references.
UPDATE public.finance_budgets fb SET spent = (
  SELECT COALESCE(SUM(-wt.amount), 0) FROM public.wallet_transactions wt
  JOIN private.workspace_wallets ww ON ww.id = wt.wallet_id AND ww.ws_id = fb.ws_id
  WHERE wt.amount < 0 AND wt.taken_at::date >= fb.start_date
    AND (fb.end_date IS NULL OR wt.taken_at::date <= fb.end_date)
    AND (fb.category_id IS NULL OR wt.category_id = fb.category_id)
    AND (fb.wallet_id IS NULL OR wt.wallet_id = fb.wallet_id)
) WHERE fb.ws_id IS DISTINCT FROM '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid; -- never write Easy Center rows
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('get_daily_invoice_totals', 'get_weekly_invoice_totals', 'get_monthly_invoice_totals')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_invoice_totals(_ws_id uuid, past_days integer DEFAULT 14, wallet_ids uuid[] DEFAULT NULL::uuid[], user_ids uuid[] DEFAULT NULL::uuid[], start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(period date, wallet_id uuid, wallet_name text, total_amount numeric, invoice_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, pg_temp
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
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
    FROM private.workspace_wallets ww
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
    FROM public.finance_invoices fi
    LEFT JOIN public.wallet_transactions wt ON fi.transaction_id = wt.id
    LEFT JOIN private.workspace_wallets ww ON wt.wallet_id = ww.id
    LEFT JOIN public.workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
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

CREATE OR REPLACE FUNCTION public.get_monthly_invoice_totals(_ws_id uuid, past_months integer DEFAULT 12, wallet_ids uuid[] DEFAULT NULL::uuid[], user_ids uuid[] DEFAULT NULL::uuid[], start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(period date, wallet_id uuid, wallet_name text, total_amount numeric, invoice_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, pg_temp
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
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
    FROM private.workspace_wallets ww
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
    FROM public.finance_invoices fi
    LEFT JOIN public.wallet_transactions wt ON fi.transaction_id = wt.id
    LEFT JOIN private.workspace_wallets ww ON wt.wallet_id = ww.id
    LEFT JOIN public.workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
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

CREATE OR REPLACE FUNCTION public.get_weekly_invoice_totals(_ws_id uuid, past_weeks integer DEFAULT 12, wallet_ids uuid[] DEFAULT NULL::uuid[], user_ids uuid[] DEFAULT NULL::uuid[], start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(period date, wallet_id uuid, wallet_name text, total_amount numeric, invoice_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, pg_temp
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
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
    FROM private.workspace_wallets ww
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
    FROM public.finance_invoices fi
    LEFT JOIN public.wallet_transactions wt ON fi.transaction_id = wt.id
    LEFT JOIN private.workspace_wallets ww ON wt.wallet_id = ww.id
    LEFT JOIN public.workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
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

CREATE OR REPLACE FUNCTION public.get_weekly_invoice_totals(_ws_id uuid, past_weeks integer DEFAULT 12, wallet_ids uuid[] DEFAULT NULL::uuid[], user_ids uuid[] DEFAULT NULL::uuid[], start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date, week_start_day integer DEFAULT 1)
 RETURNS TABLE(period date, wallet_id uuid, wallet_name text, total_amount numeric, invoice_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, pg_temp
AS $function$
DECLARE
  _start_date DATE;
  _end_date DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF start_date IS NOT NULL AND end_date IS NOT NULL THEN
    _start_date := public.trunc_to_week_start(start_date::TIMESTAMPTZ, week_start_day);
    _end_date := end_date;
  ELSE
    _end_date := CURRENT_DATE;
    _start_date := public.trunc_to_week_start(CURRENT_DATE::TIMESTAMPTZ, week_start_day) - ((past_weeks - 1) * 7);
  END IF;

  RETURN QUERY
  WITH week_series AS (
    SELECT generate_series(
      public.trunc_to_week_start(_start_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ,
      public.trunc_to_week_start(_end_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ,
      '1 week'::interval
    )::DATE AS week_start
  ),
  relevant_wallets AS (
    SELECT ww.id, ww.name
    FROM private.workspace_wallets ww
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
      public.trunc_to_week_start(fi.created_at, week_start_day) AS week_start,
      wt.wallet_id,
      SUM(fi.price)::NUMERIC AS total_amount,
      COUNT(*)::BIGINT AS invoice_count
    FROM public.finance_invoices fi
    LEFT JOIN public.wallet_transactions wt ON fi.transaction_id = wt.id
    LEFT JOIN private.workspace_wallets ww ON wt.wallet_id = ww.id
    LEFT JOIN public.workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
    WHERE fi.ws_id = _ws_id
      AND fi.created_at >= _start_date
      AND fi.created_at < _end_date + INTERVAL '1 day'
      AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
      AND (
        user_ids IS NULL OR array_length(user_ids, 1) IS NULL
        OR fi.creator_id = ANY(user_ids)
        OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
      )
    GROUP BY public.trunc_to_week_start(fi.created_at, week_start_day), wt.wallet_id
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
; COMMIT;
