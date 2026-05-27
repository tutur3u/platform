-- Extend the income/expense chart summary RPC with aggregate values so app
-- surfaces do not recalculate chart totals in TypeScript.

CREATE OR REPLACE FUNCTION public.get_income_expense_chart_summary(
  _ws_id uuid,
  _start_date timestamp with time zone DEFAULT NULL,
  _end_date timestamp with time zone DEFAULT NULL,
  include_confidential boolean DEFAULT true,
  _interval text DEFAULT 'daily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_interval text;
  v_start_date date;
  v_end_date date;
  v_start_at timestamp with time zone;
  v_end_at timestamp with time zone;
  v_can_view_amount boolean;
BEGIN
  v_interval := LOWER(COALESCE(_interval, 'daily'));

  IF v_interval NOT IN ('daily', 'monthly') THEN
    RAISE EXCEPTION 'Invalid chart interval: %', _interval;
  END IF;

  IF auth.uid() IS NULL OR NOT public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_finance_stats'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_confidential_amount'
  );

  IF v_interval = 'daily' THEN
    v_end_date := COALESCE(_end_date::date, CURRENT_DATE);
    v_start_date := COALESCE(_start_date::date, v_end_date - 13);
    v_start_at := v_start_date::timestamp with time zone;
    v_end_at := (v_end_date + 1)::timestamp with time zone;

    RETURN (
      WITH period_series AS (
        SELECT generate_series(
          v_start_date,
          v_end_date,
          interval '1 day'
        )::date AS period_date
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
      closing_balance AS (
        SELECT COALESCE(SUM(wt.amount), 0)::numeric AS amount
        FROM public.wallet_transactions wt
        JOIN public.workspace_wallets ww
          ON ww.id = wt.wallet_id
        WHERE ww.ws_id = _ws_id
          AND wt.taken_at < v_end_at
          AND (
            (NOT include_confidential AND NOT wt.is_amount_confidential)
            OR (
              include_confidential
              AND (NOT wt.is_amount_confidential OR v_can_view_amount)
            )
          )
      ),
      period_totals AS (
        SELECT
          wt.taken_at::date AS period_date,
          COALESCE(SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END), 0)::numeric AS total_income,
          ABS(COALESCE(SUM(CASE WHEN wt.amount < 0 THEN wt.amount ELSE 0 END), 0))::numeric AS total_expense
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
      series AS (
        SELECT
          ps.period_date,
          COALESCE(pt.total_income, 0)::numeric AS total_income,
          COALESCE(pt.total_expense, 0)::numeric AS total_expense
        FROM period_series ps
        LEFT JOIN period_totals pt
          ON pt.period_date = ps.period_date
        ORDER BY ps.period_date
      ),
      summary AS (
        SELECT
          COALESCE(SUM(total_income), 0)::numeric AS total_income,
          COALESCE(SUM(total_expense), 0)::numeric AS total_expense,
          COALESCE(SUM(total_income - total_expense), 0)::numeric AS net_total,
          COALESCE(AVG(total_income), 0)::numeric AS average_income,
          COALESCE(AVG(total_expense), 0)::numeric AS average_expense
        FROM series
      )
      SELECT jsonb_build_object(
        'opening_balance', (SELECT amount FROM opening_balance),
        'closing_balance', (SELECT amount FROM closing_balance),
        'total_income', (SELECT total_income FROM summary),
        'total_expense', (SELECT total_expense FROM summary),
        'net_total', (SELECT net_total FROM summary),
        'average_income', (SELECT average_income FROM summary),
        'average_expense', (SELECT average_expense FROM summary),
        'data', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'period', s.period_date,
                'total_income', s.total_income,
                'total_expense', s.total_expense
              )
              ORDER BY s.period_date
            )
            FROM series s
          ),
          '[]'::jsonb
        )
      )
    );
  END IF;

  v_end_date := COALESCE(
    date_trunc('month', _end_date)::date,
    date_trunc('month', CURRENT_DATE)::date
  );
  v_start_date := COALESCE(
    date_trunc('month', _start_date)::date,
    (v_end_date - interval '11 months')::date
  );
  v_start_at := v_start_date::timestamp with time zone;
  v_end_at := (v_end_date + interval '1 month')::timestamp with time zone;

  RETURN (
    WITH period_series AS (
      SELECT generate_series(
        v_start_date,
        v_end_date,
        interval '1 month'
      )::date AS period_date
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
    closing_balance AS (
      SELECT COALESCE(SUM(wt.amount), 0)::numeric AS amount
      FROM public.wallet_transactions wt
      JOIN public.workspace_wallets ww
        ON ww.id = wt.wallet_id
      WHERE ww.ws_id = _ws_id
        AND wt.taken_at < v_end_at
        AND (
          (NOT include_confidential AND NOT wt.is_amount_confidential)
          OR (
            include_confidential
            AND (NOT wt.is_amount_confidential OR v_can_view_amount)
          )
        )
    ),
    period_totals AS (
      SELECT
        date_trunc('month', wt.taken_at)::date AS period_date,
        COALESCE(SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END), 0)::numeric AS total_income,
        ABS(COALESCE(SUM(CASE WHEN wt.amount < 0 THEN wt.amount ELSE 0 END), 0))::numeric AS total_expense
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
      GROUP BY date_trunc('month', wt.taken_at)::date
    ),
    series AS (
      SELECT
        ps.period_date,
        COALESCE(pt.total_income, 0)::numeric AS total_income,
        COALESCE(pt.total_expense, 0)::numeric AS total_expense
      FROM period_series ps
      LEFT JOIN period_totals pt
        ON pt.period_date = ps.period_date
      ORDER BY ps.period_date
    ),
    summary AS (
      SELECT
        COALESCE(SUM(total_income), 0)::numeric AS total_income,
        COALESCE(SUM(total_expense), 0)::numeric AS total_expense,
        COALESCE(SUM(total_income - total_expense), 0)::numeric AS net_total,
        COALESCE(AVG(total_income), 0)::numeric AS average_income,
        COALESCE(AVG(total_expense), 0)::numeric AS average_expense
      FROM series
    )
    SELECT jsonb_build_object(
      'opening_balance', (SELECT amount FROM opening_balance),
      'closing_balance', (SELECT amount FROM closing_balance),
      'total_income', (SELECT total_income FROM summary),
      'total_expense', (SELECT total_expense FROM summary),
      'net_total', (SELECT net_total FROM summary),
      'average_income', (SELECT average_income FROM summary),
      'average_expense', (SELECT average_expense FROM summary),
      'data', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'period', s.period_date,
              'total_income', s.total_income,
              'total_expense', s.total_expense
            )
            ORDER BY s.period_date
          )
          FROM series s
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_income_expense_chart_summary(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text
) IS
  'Returns zero-filled daily or monthly income/expense chart data, opening and closing balances, and aggregate totals for a workspace date range.';
