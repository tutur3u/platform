-- Fix migration helper RPC functions
-- The finance_invoice_products and finance_invoice_promotions tables don't have id columns
-- We need to remove the id field from the RETURNS TABLE and include all actual columns

-- First, drop the existing functions
DROP FUNCTION IF EXISTS public.get_finance_invoice_promotions_by_workspace(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_finance_invoice_products_by_workspace(uuid, integer, integer);

-- ============================================================================
-- 1. Fix get_finance_invoice_promotions_by_workspace
-- ============================================================================
-- This table has no id column - columns are: invoice_id, code, promo_id, name, description, value, use_ratio, created_at

CREATE OR REPLACE FUNCTION public.get_finance_invoice_promotions_by_workspace(
  p_ws_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
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
-- 2. Fix get_finance_invoice_products_by_workspace
-- ============================================================================
-- This table has no id column - columns are: invoice_id, product_id, unit_id, warehouse_id, amount, price, 
-- created_at, total_diff, product_name, product_unit, warehouse

CREATE OR REPLACE FUNCTION public.get_finance_invoice_products_by_workspace(
  p_ws_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  invoice_id uuid,
  product_id uuid,
  unit_id uuid,
  warehouse_id uuid,
  amount bigint,
  price bigint,
  total_diff bigint,
  product_name text,
  product_unit text,
  warehouse text,
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
    fiprod.invoice_id,
    fiprod.product_id,
    fiprod.unit_id,
    fiprod.warehouse_id,
    fiprod.amount,
    fiprod.price,
    fiprod.total_diff,
    fiprod.product_name,
    fiprod.product_unit,
    fiprod.warehouse,
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
GRANT EXECUTE ON FUNCTION public.get_finance_invoice_promotions_by_workspace(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finance_invoice_products_by_workspace(uuid, integer, integer) TO authenticated;
