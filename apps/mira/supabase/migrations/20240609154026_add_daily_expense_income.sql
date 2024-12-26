CREATE OR REPLACE FUNCTION get_daily_income_expense(_ws_id UUID, past_days INT DEFAULT 14)
RETURNS TABLE(day DATE, total_income NUMERIC, total_expense NUMERIC) AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(CURRENT_DATE - past_days, CURRENT_DATE, '1 day'::interval)::DATE AS day
    ),
    daily_transactions AS (
        SELECT
            date_trunc('day', wt.taken_at::timestamp)::DATE AS day,
            SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END)::NUMERIC AS income,
            SUM(CASE WHEN wt.amount < 0 THEN wt.amount ELSE 0 END)::NUMERIC AS expense
        FROM
            wallet_transactions wt
            INNER JOIN workspace_wallets ww ON wt.wallet_id = ww.id
        WHERE
            wt.taken_at::date >= CURRENT_DATE - past_days
            AND ww.ws_id = _ws_id
        GROUP BY
            date_trunc('day', wt.taken_at::timestamp)::DATE
    )
    SELECT
        ds.day,
        COALESCE(dt.income, 0)::NUMERIC AS total_income,
        ABS(COALESCE(dt.expense, 0))::NUMERIC AS total_expense
    FROM
        date_series ds
        LEFT JOIN daily_transactions dt ON ds.day = dt.day
    ORDER BY
        ds.day;
END; $$
LANGUAGE plpgsql;
