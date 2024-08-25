CREATE OR REPLACE FUNCTION get_transaction_categories_with_amount() RETURNS TABLE (
        id uuid,
        name text,
        is_expense boolean,
        ws_id uuid,
        created_at timestamp with time zone,
        amount bigint
    ) AS $$
SELECT transaction_categories.*,
    count(wallet_transactions.*) as amount
FROM transaction_categories
    LEFT JOIN wallet_transactions ON wallet_transactions.category_id = transaction_categories.id
GROUP BY transaction_categories.id $$ LANGUAGE SQL;