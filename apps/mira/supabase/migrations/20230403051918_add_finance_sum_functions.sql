-- Create a function to calculate sum of all wallets in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_sum(ws_id uuid) RETURNS numeric AS $$
SELECT SUM(balance)
FROM public.workspace_wallets
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all wallets in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_wallets
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all transactions in a specific workspace,
-- given that ws_id only exists in workspace_wallets, wallet_transactions only have access to
-- wallet_id, so we need to join the two tables to get the ws_id
CREATE OR REPLACE FUNCTION public.get_workspace_transactions_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.wallet_transactions wt
    INNER JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
WHERE ww.ws_id = $1 $$ LANGUAGE SQL;
-- Create a function to calculate count of all transaction categories in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_transaction_categories_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.transaction_categories
WHERE ws_id = $1 $$ LANGUAGE SQL;