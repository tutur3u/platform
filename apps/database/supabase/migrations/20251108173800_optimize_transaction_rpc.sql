-- Migration: Optimize transaction RPC function with pagination, filtering, and sorting
-- This migration replaces the get_wallet_transactions_with_permissions function
-- with an optimized version that supports comprehensive filtering, sorting, and pagination

-- Drop the old function and its grants
DROP FUNCTION IF EXISTS public.get_wallet_transactions_with_permissions(uuid, uuid, uuid[]);

-- Create optimized function with comprehensive parameters
CREATE OR REPLACE FUNCTION public.get_wallet_transactions_with_permissions(
  -- Required parameters
  p_ws_id uuid,
  
  -- Optional user ID (defaults to current user)
  p_user_id uuid DEFAULT auth.uid(),
  
  -- Filtering parameters
  p_transaction_ids uuid[] DEFAULT NULL,
  p_wallet_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_creator_ids uuid[] DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date timestamp with time zone DEFAULT NULL,
  
  -- Sorting parameters
  p_order_by text DEFAULT 'taken_at', -- Options: taken_at, created_at, amount
  p_order_direction text DEFAULT 'DESC', -- Options: ASC, DESC
  
  -- Pagination parameters (offset-based)
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0,
  
  -- Pagination parameters (cursor-based)
  p_cursor_taken_at timestamp with time zone DEFAULT NULL,
  p_cursor_created_at timestamp with time zone DEFAULT NULL,
  
  -- Return total count (may be expensive for large datasets)
  p_include_count boolean DEFAULT FALSE
)
RETURNS TABLE (
  id uuid,
  amount numeric,
  category_id uuid,
  created_at timestamp with time zone,
  creator_id uuid,
  description text,
  invoice_id uuid,
  report_opt_in boolean,
  taken_at timestamp with time zone,
  wallet_id uuid,
  is_amount_confidential boolean,
  is_description_confidential boolean,
  is_category_confidential boolean,
  total_count bigint -- Only populated if p_include_count = TRUE
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  can_view_description boolean;
  can_view_category boolean;
  v_total_count bigint := NULL;
  v_order_clause text;
BEGIN
  -- Check user's permissions for viewing confidential fields
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  can_view_description := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_description');
  can_view_category := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_category');

  -- Validate order_by parameter
  IF p_order_by NOT IN ('taken_at', 'created_at', 'amount') THEN
    p_order_by := 'taken_at';
  END IF;

  -- Validate order_direction parameter
  IF p_order_direction NOT IN ('ASC', 'DESC') THEN
    p_order_direction := 'DESC';
  END IF;

  -- Build ORDER BY clause
  -- For taken_at, add created_at as secondary sort for deterministic ordering
  IF p_order_by = 'taken_at' THEN
    v_order_clause := format('wt.taken_at %s, wt.created_at %s', p_order_direction, p_order_direction);
  ELSIF p_order_by = 'created_at' THEN
    v_order_clause := format('wt.created_at %s', p_order_direction);
  ELSIF p_order_by = 'amount' THEN
    v_order_clause := format('wt.amount %s, wt.taken_at %s', p_order_direction, p_order_direction);
  END IF;

  -- Get total count if requested (before pagination)
  IF p_include_count THEN
    SELECT COUNT(*)
    INTO v_total_count
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE ww.ws_id = p_ws_id
      AND (p_transaction_ids IS NULL OR wt.id = ANY(p_transaction_ids))
      AND (p_wallet_ids IS NULL OR wt.wallet_id = ANY(p_wallet_ids))
      AND (p_category_ids IS NULL OR wt.category_id = ANY(p_category_ids))
      AND (p_creator_ids IS NULL OR wt.creator_id = ANY(p_creator_ids))
      AND (p_start_date IS NULL OR wt.taken_at >= p_start_date)
      AND (p_end_date IS NULL OR wt.taken_at <= p_end_date)
      AND (
        p_search_query IS NULL 
        OR wt.description ILIKE '%' || p_search_query || '%'
      )
      -- Cursor-based pagination filter (for "has more" check)
      AND (
        p_cursor_taken_at IS NULL 
        OR p_cursor_created_at IS NULL
        OR (
          wt.taken_at < p_cursor_taken_at
          OR (wt.taken_at = p_cursor_taken_at AND wt.created_at < p_cursor_created_at)
        )
      );
  END IF;

  -- Return query with all filters and pagination
  RETURN QUERY EXECUTE format('
    SELECT
      wt.id,
      -- Redact amount if confidential and user lacks permission
      CASE 
        WHEN wt.is_amount_confidential AND NOT $1 THEN NULL
        ELSE wt.amount
      END AS amount,
      -- Redact category if confidential and user lacks permission
      CASE 
        WHEN wt.is_category_confidential AND NOT $2 THEN NULL
        ELSE wt.category_id
      END AS category_id,
      wt.created_at,
      wt.creator_id,
      -- Redact description if confidential and user lacks permission
      CASE 
        WHEN wt.is_description_confidential AND NOT $3 THEN ''[CONFIDENTIAL]''
        ELSE wt.description
      END AS description,
      wt.invoice_id,
      wt.report_opt_in,
      wt.taken_at,
      wt.wallet_id,
      -- Always include confidentiality flags so UI knows to show redaction indicators
      wt.is_amount_confidential,
      wt.is_description_confidential,
      wt.is_category_confidential,
      $4::bigint AS total_count
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
    WHERE ww.ws_id = $5
      AND ($6::uuid[] IS NULL OR wt.id = ANY($6))
      AND ($7::uuid[] IS NULL OR wt.wallet_id = ANY($7))
      AND ($8::uuid[] IS NULL OR wt.category_id = ANY($8))
      AND ($9::uuid[] IS NULL OR wt.creator_id = ANY($9))
      AND ($10::timestamp with time zone IS NULL OR wt.taken_at >= $10)
      AND ($11::timestamp with time zone IS NULL OR wt.taken_at <= $11)
      AND (
        $12::text IS NULL 
        OR wt.description ILIKE ''%%'' || $12 || ''%%''
      )
      -- Cursor-based pagination filter
      AND (
        $13::timestamp with time zone IS NULL 
        OR $14::timestamp with time zone IS NULL
        OR (
          wt.taken_at < $13
          OR (wt.taken_at = $13 AND wt.created_at < $14)
        )
      )
    ORDER BY %s
    LIMIT $15
    OFFSET $16
  ', v_order_clause)
  USING 
    can_view_amount,              -- $1
    can_view_category,            -- $2
    can_view_description,         -- $3
    v_total_count,                -- $4
    p_ws_id,                      -- $5
    p_transaction_ids,            -- $6
    p_wallet_ids,                 -- $7
    p_category_ids,               -- $8
    p_creator_ids,                -- $9
    p_start_date,                 -- $10
    p_end_date,                   -- $11
    p_search_query,               -- $12
    p_cursor_taken_at,            -- $13
    p_cursor_created_at,          -- $14
    p_limit,                      -- $15
    p_offset;                     -- $16
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_wallet_transactions_with_permissions(
  uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, timestamp with time zone, timestamp with time zone,
  text, text, integer, integer, timestamp with time zone, timestamp with time zone, boolean
) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.get_wallet_transactions_with_permissions IS
  'Optimized function that returns wallet transactions with confidential fields redacted based on user permissions. Supports comprehensive filtering, sorting (taken_at/created_at/amount), and both offset-based and cursor-based pagination. Set p_include_count=TRUE to get total count (may impact performance).';

-- Add index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_taken_at_created_at
ON public.wallet_transactions (taken_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_taken_at
ON public.wallet_transactions (wallet_id, taken_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_category_taken_at
ON public.wallet_transactions (category_id, taken_at DESC)
WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_creator_taken_at
ON public.wallet_transactions (creator_id, taken_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_description_gin
ON public.wallet_transactions USING gin (description gin_trgm_ops);

-- Enable pg_trgm extension for text search if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

