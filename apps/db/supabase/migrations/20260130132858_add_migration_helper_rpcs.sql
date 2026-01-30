-- Migration helper RPC functions
--
-- These functions fetch related table data by workspace ID using efficient JOINs.
-- Used by migration infrastructure to avoid pagination issues with Supabase's
-- 1000-row default limit when using .in() queries.

-- ============================================================================
-- 1. get_finance_invoice_user_groups_by_workspace
-- ============================================================================
-- Fetches all finance_invoice_user_groups for a workspace in a single query
-- with proper JOIN through finance_invoices.

CREATE OR REPLACE FUNCTION public.get_finance_invoice_user_groups_by_workspace(
  p_ws_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  invoice_id uuid,
  user_group_id uuid,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  -- Count total first
  SELECT COUNT(*) INTO v_total
  FROM finance_invoice_user_groups fiug
  INNER JOIN finance_invoices fi ON fi.id = fiug.invoice_id
  WHERE fi.ws_id = p_ws_id;

  -- Return paginated results with total
  RETURN QUERY
  SELECT
    fiug.invoice_id,
    fiug.user_group_id,
    fiug.created_at,
    v_total as total_count
  FROM finance_invoice_user_groups fiug
  INNER JOIN finance_invoices fi ON fi.id = fiug.invoice_id
  WHERE fi.ws_id = p_ws_id
  ORDER BY fiug.created_at
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 2. get_finance_invoice_promotions_by_workspace
-- ============================================================================
-- Fetches all finance_invoice_promotions for a workspace in a single query
-- with proper JOIN through finance_invoices.

CREATE OR REPLACE FUNCTION public.get_finance_invoice_promotions_by_workspace(
  p_ws_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  invoice_id uuid,
  code text,
  promo_id uuid,
  name text,
  description text,
  value integer,
  use_ratio boolean,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM finance_invoice_promotions fip
  INNER JOIN finance_invoices fi ON fi.id = fip.invoice_id
  WHERE fi.ws_id = p_ws_id;

  RETURN QUERY
  SELECT
    fip.id,
    fip.invoice_id,
    fip.code,
    fip.promo_id,
    fip.name,
    fip.description,
    fip.value,
    fip.use_ratio,
    fip.created_at,
    v_total as total_count
  FROM finance_invoice_promotions fip
  INNER JOIN finance_invoices fi ON fi.id = fip.invoice_id
  WHERE fi.ws_id = p_ws_id
  ORDER BY fip.created_at
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 3. get_finance_invoice_products_by_workspace
-- ============================================================================
-- Fetches all finance_invoice_products for a workspace in a single query
-- with proper JOIN through finance_invoices.

CREATE OR REPLACE FUNCTION public.get_finance_invoice_products_by_workspace(
  p_ws_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  invoice_id uuid,
  product_id uuid,
  unit_id uuid,
  warehouse_id uuid,
  amount numeric,
  price numeric,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM finance_invoice_products fiprod
  INNER JOIN finance_invoices fi ON fi.id = fiprod.invoice_id
  WHERE fi.ws_id = p_ws_id;

  RETURN QUERY
  SELECT
    fiprod.id,
    fiprod.invoice_id,
    fiprod.product_id,
    fiprod.unit_id,
    fiprod.warehouse_id,
    fiprod.amount,
    fiprod.price,
    fiprod.created_at,
    v_total as total_count
  FROM finance_invoice_products fiprod
  INNER JOIN finance_invoices fi ON fi.id = fiprod.invoice_id
  WHERE fi.ws_id = p_ws_id
  ORDER BY fiprod.created_at
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_finance_invoice_user_groups_by_workspace(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finance_invoice_promotions_by_workspace(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finance_invoice_products_by_workspace(uuid, integer, integer) TO authenticated;
