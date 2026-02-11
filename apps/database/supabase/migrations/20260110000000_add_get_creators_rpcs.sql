-- Function to get users who have created transactions in a workspace
CREATE OR REPLACE FUNCTION public.get_transaction_creators(p_ws_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    u.id,
    u.full_name,
    u.email,
    u.avatar_url
  FROM public.workspace_users u
  JOIN public.wallet_transactions t ON t.creator_id = u.id
  JOIN public.workspace_wallets w ON t.wallet_id = w.id
  WHERE w.ws_id = p_ws_id
  ORDER BY u.full_name;
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_transaction_creators(uuid) TO authenticated;

-- Function to get users who have created invoices in a workspace
CREATE OR REPLACE FUNCTION public.get_invoice_creators(p_ws_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    u.id,
    u.full_name,
    u.email,
    u.avatar_url
  FROM public.workspace_users u
  JOIN public.finance_invoices i ON i.creator_id = u.id
  WHERE i.ws_id = p_ws_id
  ORDER BY u.full_name;
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_invoice_creators(uuid) TO authenticated;
