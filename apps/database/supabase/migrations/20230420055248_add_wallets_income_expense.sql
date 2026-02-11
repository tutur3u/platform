-- Create a function to calculate sum of all income transactions in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_income(ws_id uuid) RETURNS numeric AS $$
SELECT SUM(amount)
FROM public.wallet_transactions wt
WHERE wt.wallet_id IN (
        SELECT id
        FROM public.workspace_wallets
        WHERE ws_id = $1
    )
    AND wt.amount > 0 $$ LANGUAGE SQL;
-- Create a function to calculate sum of all expense transactions in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_expense(ws_id uuid) RETURNS numeric AS $$
SELECT SUM(amount)
FROM public.wallet_transactions wt
WHERE wt.wallet_id IN (
        SELECT id
        FROM public.workspace_wallets
        WHERE ws_id = $1
    )
    AND wt.amount < 0 $$ LANGUAGE SQL;