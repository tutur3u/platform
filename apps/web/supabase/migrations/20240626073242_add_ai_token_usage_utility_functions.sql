CREATE OR REPLACE FUNCTION get_monthly_prompt_completion_tokens(past_months INT DEFAULT 12)
RETURNS TABLE(month DATE, total_prompt_tokens NUMERIC, total_completion_tokens NUMERIC) AS $$
BEGIN
    RETURN QUERY
    WITH month_series AS (
        SELECT generate_series(
            date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1), 
            date_trunc('month', CURRENT_DATE), 
            '1 month'::interval
        )::DATE AS month
    ),
    monthly_ai_chat_messages AS (
        SELECT
            date_trunc('month', acm.created_at::timestamp)::DATE AS month,
            SUM(acm.prompt_tokens)::NUMERIC AS prompt_tokens,
            SUM(acm.completion_tokens)::NUMERIC AS completion_tokens
        FROM
            ai_chat_messages acm
        WHERE
            acm.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (past_months - 1)
            AND acm.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        GROUP BY
            date_trunc('month', acm.created_at::timestamp)::DATE
    )
    SELECT
        ms.month,
        COALESCE(mcm.prompt_tokens, 0)::NUMERIC AS total_prompt_tokens,
        COALESCE(mcm.completion_tokens, 0)::NUMERIC AS total_completion_tokens
    FROM
        month_series ms
        LEFT JOIN monthly_ai_chat_messages mcm ON ms.month = mcm.month
    ORDER BY
        ms.month;
END; $$
LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_daily_prompt_completion_tokens(past_days INT DEFAULT 14)
RETURNS TABLE(day DATE, total_prompt_tokens NUMERIC, total_completion_tokens NUMERIC) AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(CURRENT_DATE - (past_days - 1), CURRENT_DATE, '1 day'::interval)::DATE AS day
    ),
    daily_ai_chat_messages AS (
        SELECT
            date_trunc('day', acm.created_at::timestamp)::DATE AS day,
            SUM(acm.prompt_tokens)::NUMERIC AS prompt_tokens,
            SUM(acm.completion_tokens)::NUMERIC AS completion_tokens
        FROM
            ai_chat_messages acm
        WHERE
            acm.created_at::date >= CURRENT_DATE - (past_days - 1)
        GROUP BY
            date_trunc('day', acm.created_at::timestamp)::DATE
    )
    SELECT
        ds.day,
        COALESCE(dcm.prompt_tokens, 0)::NUMERIC AS total_prompt_tokens,
        COALESCE(dcm.completion_tokens, 0)::NUMERIC AS total_completion_tokens
    FROM
        date_series ds
        LEFT JOIN daily_ai_chat_messages dcm ON ds.day = dcm.day
    ORDER BY
        ds.day;
END; $$
LANGUAGE plpgsql;