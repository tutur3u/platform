-- Migration: update_transaction_permissions_logic
-- Updates transaction RPCs to respect view_expenses and view_incomes permissions
-- Logic: Granular permissions (view_expenses/view_incomes) override the broad view_transactions permission if present.

-- 1. Update get_wallet_transactions_with_permissions
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
  p_order_by text DEFAULT 'taken_at',
  p_order_direction text DEFAULT 'DESC',
  
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
  platform_creator_id uuid,
  description text,
  invoice_id uuid,
  report_opt_in boolean,
  taken_at timestamp with time zone,
  wallet_id uuid,
  wallet_name text,
  creator_full_name text,
  creator_email text,
  creator_avatar_url text,
  is_amount_confidential boolean,
  is_description_confidential boolean,
  is_category_confidential boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_transactions boolean;
  can_view_expenses boolean;
  can_view_incomes boolean;
  
  can_view_amount boolean;
  can_view_description boolean;
  can_view_category boolean;
  
  has_granular_permissions boolean;
  
  v_total_count bigint := NULL;
  v_order_clause text;
BEGIN
  -- Check user's permissions
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  can_view_description := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_description');
  can_view_category := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_category');

  -- Determine if we should use granular logic
  has_granular_permissions := can_view_expenses OR can_view_incomes;

  -- Validate order_by parameter
  IF p_order_by NOT IN ('taken_at', 'created_at', 'amount') THEN
    p_order_by := 'taken_at';
  END IF;

  -- Validate order_direction parameter
  IF p_order_direction NOT IN ('ASC', 'DESC') THEN
    p_order_direction := 'DESC';
  END IF;

  -- Build ORDER BY clause
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
      -- Permission Logic
      AND (
        -- Legacy fallback: If user has view_transactions BUT NO granular permissions, show everything
        (can_view_transactions AND NOT has_granular_permissions)
        
        -- Granular: Show if matching specific permission
        OR (can_view_expenses AND wt.amount < 0)
        OR (can_view_incomes AND wt.amount > 0)
      )
      AND (p_transaction_ids IS NULL OR wt.id = ANY(p_transaction_ids))
      AND (p_wallet_ids IS NULL OR wt.wallet_id = ANY(p_wallet_ids))
      AND (p_category_ids IS NULL OR wt.category_id = ANY(p_category_ids))
      AND (p_creator_ids IS NULL OR (wt.creator_id = ANY(p_creator_ids) OR wt.platform_creator_id = ANY(p_creator_ids)))
      AND (p_start_date IS NULL OR wt.taken_at >= p_start_date)
      AND (p_end_date IS NULL OR wt.taken_at <= p_end_date)
      AND (
        p_search_query IS NULL 
        OR wt.description ILIKE '%' || p_search_query || '%'
      )
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
      CASE 
        WHEN wt.is_amount_confidential AND NOT $1 THEN NULL
        ELSE wt.amount
      END AS amount,
      CASE 
        WHEN wt.is_category_confidential AND NOT $2 THEN NULL
        ELSE wt.category_id
      END AS category_id,
      wt.created_at,
      wt.creator_id,
      wt.platform_creator_id,
      CASE 
        WHEN wt.is_description_confidential AND NOT $3 THEN ''[CONFIDENTIAL]''
        ELSE wt.description
      END AS description,
      wt.invoice_id,
      wt.report_opt_in,
      wt.taken_at,
      wt.wallet_id,
      ww.name as wallet_name,
      COALESCE(
        u.display_name, 
        upd.full_name, 
        upd.email, 
        wu.full_name, 
        wu.email,
        u_inv.display_name,
        upd_inv.full_name,
        upd_inv.email,
        wu_inv.full_name,
        wu_inv.email
      ) as creator_full_name,
      COALESCE(
        upd.email, 
        wu.email,
        upd_inv.email,
        wu_inv.email
      ) as creator_email,
      COALESCE(
        u.avatar_url, 
        wu.avatar_url,
        u_inv.avatar_url,
        wu_inv.avatar_url
      ) as creator_avatar_url,
      wt.is_amount_confidential,
      wt.is_description_confidential,
      wt.is_category_confidential,
      $4::bigint AS total_count
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
    
    LEFT JOIN public.users u ON wt.platform_creator_id = u.id
    LEFT JOIN public.user_private_details upd ON wt.platform_creator_id = upd.user_id
    LEFT JOIN public.workspace_users wu ON wt.creator_id = wu.id
    
    LEFT JOIN public.finance_invoices fi ON wt.invoice_id = fi.id
    LEFT JOIN public.users u_inv ON fi.platform_creator_id = u_inv.id
    LEFT JOIN public.user_private_details upd_inv ON fi.platform_creator_id = upd_inv.user_id
    LEFT JOIN public.workspace_users wu_inv ON fi.creator_id = wu_inv.id
    
    WHERE ww.ws_id = $5
      -- Permission Logic
      AND (
        ($20 AND NOT $21) -- (can_view_transactions AND NOT has_granular)
        OR ($18 AND wt.amount < 0) -- can_view_expenses
        OR ($19 AND wt.amount > 0) -- can_view_incomes
      )
      AND ($6::uuid[] IS NULL OR wt.id = ANY($6))
      AND ($7::uuid[] IS NULL OR wt.wallet_id = ANY($7))
      AND ($8::uuid[] IS NULL OR wt.category_id = ANY($8))
      AND ($9::uuid[] IS NULL OR (wt.creator_id = ANY($9) OR wt.platform_creator_id = ANY($9)))
      AND ($10::timestamp with time zone IS NULL OR wt.taken_at >= $10)
      AND ($11::timestamp with time zone IS NULL OR wt.taken_at <= $11)
      AND (
        $12::text IS NULL 
        OR wt.description ILIKE ''%%'' || $12 || ''%%''
      )
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
    p_offset,                     -- $16
    NULL,                         -- $17 (unused placeholder to keep numbering similar to thought process if needed, but cleaned up below)
    can_view_expenses,            -- $18
    can_view_incomes,             -- $19
    can_view_transactions,        -- $20
    has_granular_permissions;     -- $21
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_transactions_with_permissions(
  uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, timestamp with time zone, timestamp with time zone,
  text, text, integer, integer, timestamp with time zone, timestamp with time zone, boolean
) TO authenticated;

-- 2. Update get_wallet_income_sum
CREATE OR REPLACE FUNCTION public.get_wallet_income_sum(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_transactions boolean;
  can_view_expenses boolean;
  can_view_incomes boolean;
  can_view_amount boolean;
  has_granular boolean;
  result numeric;
BEGIN
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');

  has_granular := can_view_expenses OR can_view_incomes;

  -- Logic: 
  -- If granular: MUST have view_incomes
  -- If legacy: MUST have view_transactions
  IF has_granular AND NOT can_view_incomes THEN
    RETURN 0;
  END IF;

  IF NOT has_granular AND NOT can_view_transactions THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount > 0
    AND (
      (NOT p_include_confidential AND NOT wt.is_amount_confidential)
      OR
      (p_include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_income_sum(uuid, uuid, boolean) TO authenticated;

-- 3. Update get_wallet_income_count
CREATE OR REPLACE FUNCTION public.get_wallet_income_count(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_include_confidential boolean DEFAULT true
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_transactions boolean;
  can_view_expenses boolean;
  can_view_incomes boolean;
  can_view_amount boolean;
  has_granular boolean;
  result bigint;
BEGIN
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  
  has_granular := can_view_expenses OR can_view_incomes;

  IF has_granular AND NOT can_view_incomes THEN
    RETURN 0;
  END IF;

  IF NOT has_granular AND NOT can_view_transactions THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount > 0
    AND (
      (NOT p_include_confidential AND NOT wt.is_amount_confidential)
      OR
      (p_include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_income_count(uuid, uuid, boolean) TO authenticated;

-- 4. Update get_wallet_expense_sum
CREATE OR REPLACE FUNCTION public.get_wallet_expense_sum(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_transactions boolean;
  can_view_expenses boolean;
  can_view_incomes boolean;
  can_view_amount boolean;
  has_granular boolean;
  result numeric;
BEGIN
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');

  has_granular := can_view_expenses OR can_view_incomes;

  -- Logic: 
  -- If granular: MUST have view_expenses
  -- If legacy: MUST have view_transactions
  IF has_granular AND NOT can_view_expenses THEN
    RETURN 0;
  END IF;

  IF NOT has_granular AND NOT can_view_transactions THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount < 0
    AND (
      (NOT p_include_confidential AND NOT wt.is_amount_confidential)
      OR
      (p_include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_expense_sum(uuid, uuid, boolean) TO authenticated;

-- 5. Update get_wallet_expense_count
CREATE OR REPLACE FUNCTION public.get_wallet_expense_count(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_include_confidential boolean DEFAULT true
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_transactions boolean;
  can_view_expenses boolean;
  can_view_incomes boolean;
  can_view_amount boolean;
  has_granular boolean;
  result bigint;
BEGIN
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  
  has_granular := can_view_expenses OR can_view_incomes;

  IF has_granular AND NOT can_view_expenses THEN
    RETURN 0;
  END IF;

  IF NOT has_granular AND NOT can_view_transactions THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND wt.amount < 0
    AND (
      (NOT p_include_confidential AND NOT wt.is_amount_confidential)
      OR
      (p_include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_expense_count(uuid, uuid, boolean) TO authenticated;

-- 6. Update get_workspace_wallets_income
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_income(
  ws_id uuid,
  start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_transactions boolean;
  can_view_expenses boolean;
  can_view_incomes boolean;
  can_view_amount boolean;
  has_granular boolean;
  result numeric;
BEGIN
  can_view_transactions := public.has_workspace_permission(ws_id, auth.uid(), 'view_transactions');
  can_view_expenses := public.has_workspace_permission(ws_id, auth.uid(), 'view_expenses');
  can_view_incomes := public.has_workspace_permission(ws_id, auth.uid(), 'view_incomes');
  can_view_amount := public.has_workspace_permission(ws_id, auth.uid(), 'view_confidential_amount');

  has_granular := can_view_expenses OR can_view_incomes;

  IF has_granular AND NOT can_view_incomes THEN
    RETURN 0;
  END IF;

  IF NOT has_granular AND NOT can_view_transactions THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = $1
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
    AND wt.amount > 0
    AND (
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR
      (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    )
    AND (
      (start_date IS NULL AND end_date IS NULL)
      OR (start_date IS NULL AND wt.taken_at <= $3)
      OR (end_date IS NULL AND wt.taken_at >= $2)
      OR (wt.taken_at BETWEEN $2 AND $3)
    );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_wallets_income(uuid, timestamp with time zone, timestamp with time zone, boolean) TO authenticated;

-- 7. Update get_workspace_wallets_expense
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_expense(
  ws_id uuid,
  start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  include_confidential boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_transactions boolean;
  can_view_expenses boolean;
  can_view_incomes boolean;
  can_view_amount boolean;
  has_granular boolean;
  result numeric;
BEGIN
  can_view_transactions := public.has_workspace_permission(ws_id, auth.uid(), 'view_transactions');
  can_view_expenses := public.has_workspace_permission(ws_id, auth.uid(), 'view_expenses');
  can_view_incomes := public.has_workspace_permission(ws_id, auth.uid(), 'view_incomes');
  can_view_amount := public.has_workspace_permission(ws_id, auth.uid(), 'view_confidential_amount');

  has_granular := can_view_expenses OR can_view_incomes;

  IF has_granular AND NOT can_view_expenses THEN
    RETURN 0;
  END IF;

  IF NOT has_granular AND NOT can_view_transactions THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(wt.amount), 0)
  INTO result
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = $1
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
    AND wt.amount < 0
    AND (
      (NOT include_confidential AND NOT wt.is_amount_confidential)
      OR
      (include_confidential AND (NOT wt.is_amount_confidential OR can_view_amount))
    )
    AND (
      (start_date IS NULL AND end_date IS NULL)
      OR (start_date IS NULL AND wt.taken_at <= $3)
      OR (end_date IS NULL AND wt.taken_at >= $2)
      OR (wt.taken_at BETWEEN $2 AND $3)
    );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_wallets_expense(uuid, timestamp with time zone, timestamp with time zone, boolean) TO authenticated;
