alter table "public"."wallet_transactions"
add column "report_opt_in" boolean not null default true;
alter table "public"."workspace_wallets"
add column "report_opt_in" boolean not null default true;
DROP FUNCTION public.get_workspace_wallets_income(
    ws_id uuid,
    start_date timestamptz,
    end_date timestamptz
);
DROP FUNCTION public.get_workspace_wallets_expense(
    ws_id uuid,
    start_date timestamptz,
    end_date timestamptz
);
DROP FUNCTION public.get_workspace_wallets_sum(ws_id uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_income(
        ws_id uuid,
        start_date timestamptz = NULL,
        end_date timestamptz = NULL
    ) RETURNS numeric AS $$
SELECT SUM(amount)
FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
WHERE ww.ws_id = $1
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
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
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
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