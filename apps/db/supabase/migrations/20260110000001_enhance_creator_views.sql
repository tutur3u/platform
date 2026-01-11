-- Enhance distinct_invoice_creators view to include more user details and workspace ID
CREATE OR REPLACE VIEW public.distinct_invoice_creators WITH (security_invoker=on) AS
SELECT DISTINCT
    u.id,
    COALESCE(u.display_name, u.full_name) AS display_name,
    u.full_name,
    u.email,
    u.avatar_url,
    i.ws_id
FROM finance_invoices i
JOIN workspace_users u ON u.id = i.creator_id;

-- Create distinct_transaction_creators view for consistency
CREATE OR REPLACE VIEW public.distinct_transaction_creators WITH (security_invoker=on) AS
SELECT DISTINCT
    u.id,
    COALESCE(u.display_name, u.full_name) AS display_name,
    u.full_name,
    u.email,
    u.avatar_url,
    w.ws_id
FROM wallet_transactions t
JOIN workspace_wallets w ON t.wallet_id = w.id
JOIN workspace_users u ON u.id = t.creator_id;
