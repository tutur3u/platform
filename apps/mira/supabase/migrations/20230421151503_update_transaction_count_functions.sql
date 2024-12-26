DROP FUNCTION public.get_workspace_transactions_count(ws_id uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_transactions_count(
        ws_id uuid,
        start_date timestamptz = NULL,
        end_date timestamptz = NULL
    ) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
WHERE ww.ws_id = $1
    AND (
        (
            start_date IS NULL
            AND end_date IS NULL
        )
        OR (
            start_date IS NULL
            AND wt.taken_at <= $3
        )
        OR (
            end_date IS NULL
            AND wt.taken_at >= $2
        )
        OR (
            wt.taken_at BETWEEN $2 AND $3
        )
    ) $$ LANGUAGE SQL;
DROP FUNCTION public.get_workspace_wallets_income(ws_id uuid);
DROP FUNCTION public.get_workspace_wallets_expense(ws_id uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_income(
        ws_id uuid,
        start_date timestamptz = NULL,
        end_date timestamptz = NULL
    ) RETURNS numeric AS $$
SELECT SUM(amount)
FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
WHERE ww.ws_id = $1
    AND wt.amount > 0
    AND (
        (
            start_date IS NULL
            AND end_date IS NULL
        )
        OR (
            start_date IS NULL
            AND wt.taken_at <= $3
        )
        OR (
            end_date IS NULL
            AND wt.taken_at >= $2
        )
        OR (
            wt.taken_at BETWEEN $2 AND $3
        )
    ) $$ LANGUAGE SQL;
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_expense(
        ws_id uuid,
        start_date timestamptz = NULL,
        end_date timestamptz = NULL
    ) RETURNS numeric AS $$
SELECT SUM(amount)
FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
WHERE ww.ws_id = $1
    AND wt.amount < 0
    AND (
        (
            start_date IS NULL
            AND end_date IS NULL
        )
        OR (
            start_date IS NULL
            AND wt.taken_at <= $3
        )
        OR (
            end_date IS NULL
            AND wt.taken_at >= $2
        )
        OR (
            wt.taken_at BETWEEN $2 AND $3
        )
    ) $$ LANGUAGE SQL;