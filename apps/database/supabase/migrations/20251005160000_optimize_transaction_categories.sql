-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_category_id ON wallet_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_workspace_wallets_ws_id ON workspace_wallets(ws_id);
CREATE INDEX IF NOT EXISTS idx_transaction_categories_ws_id ON transaction_categories(ws_id);

-- Drop the old inefficient function
DROP FUNCTION IF EXISTS get_transaction_categories_with_amount();

-- Create optimized function that filters by workspace first
CREATE OR REPLACE FUNCTION get_transaction_categories_with_amount_by_workspace(p_ws_id uuid)
RETURNS TABLE (
    id uuid,
    name text,
    is_expense boolean,
    ws_id uuid,
    created_at timestamp with time zone,
    amount numeric,
    transaction_count bigint
) AS $$
SELECT
    tc.id,
    tc.name,
    tc.is_expense,
    tc.ws_id,
    tc.created_at,
    COALESCE(SUM(ABS(wt.amount)), 0) as amount,
    COUNT(wt.id) as transaction_count
FROM transaction_categories tc
LEFT JOIN wallet_transactions wt ON wt.category_id = tc.id
LEFT JOIN workspace_wallets ww ON wt.wallet_id = ww.id AND ww.ws_id = p_ws_id
WHERE tc.ws_id = p_ws_id
GROUP BY tc.id, tc.name, tc.is_expense, tc.ws_id, tc.created_at
ORDER BY tc.name ASC
$$ LANGUAGE SQL STABLE;
