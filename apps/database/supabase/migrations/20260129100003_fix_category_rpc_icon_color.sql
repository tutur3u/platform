-- Migration: fix_category_rpc_icon_color
-- Updates get_transaction_categories_with_amount_by_workspace() to include icon and color fields
-- that were added in 20260129100000_add_category_icon_color.sql

-- Drop the existing function to update return type
DROP FUNCTION IF EXISTS get_transaction_categories_with_amount_by_workspace(uuid);

-- Recreate function with icon and color fields
CREATE OR REPLACE FUNCTION get_transaction_categories_with_amount_by_workspace(p_ws_id uuid)
RETURNS TABLE (
    id uuid,
    name text,
    is_expense boolean,
    ws_id uuid,
    created_at timestamp with time zone,
    icon text,
    color text,
    amount numeric,
    transaction_count bigint
) AS $$
SELECT
    tc.id,
    tc.name,
    tc.is_expense,
    tc.ws_id,
    tc.created_at,
    tc.icon,
    tc.color,
    COALESCE(SUM(ABS(wt.amount)), 0) as amount,
    COUNT(wt.id) as transaction_count
FROM transaction_categories tc
LEFT JOIN wallet_transactions wt ON wt.category_id = tc.id
LEFT JOIN workspace_wallets ww ON wt.wallet_id = ww.id AND ww.ws_id = p_ws_id
WHERE tc.ws_id = p_ws_id
GROUP BY tc.id, tc.name, tc.is_expense, tc.ws_id, tc.created_at, tc.icon, tc.color
ORDER BY tc.name ASC
$$ LANGUAGE SQL STABLE;
