-- Drop existing function first
DROP FUNCTION IF EXISTS get_transaction_categories_with_amount();

-- Create updated function to return both transaction count and total amount
CREATE FUNCTION get_transaction_categories_with_amount()
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
    transaction_categories.id,
    transaction_categories.name,
    transaction_categories.is_expense,
    transaction_categories.ws_id,
    transaction_categories.created_at,
    COALESCE(SUM(ABS(wallet_transactions.amount)), 0) as amount,
    COUNT(wallet_transactions.id) as transaction_count
FROM transaction_categories
LEFT JOIN wallet_transactions ON wallet_transactions.category_id = transaction_categories.id
GROUP BY transaction_categories.id, transaction_categories.name, transaction_categories.is_expense, transaction_categories.ws_id, transaction_categories.created_at
$$ LANGUAGE SQL;
