-- Migration: reintegrate_granular_transaction_permissions
-- Reintegrates view_expenses and view_incomes permissions while preserving wallet access controls

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
  
  has_manage_finance boolean;
  has_granular_permissions boolean;
  
  v_total_count bigint := NULL;
  v_order_clause text;
  v_allowed_wallet_ids uuid[];
  v_wallet_access RECORD;
  v_wallet_windows JSONB := '{}';
  v_filter_cte text;
BEGIN
  -- Check user's permissions
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  can_view_description := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_description');
  can_view_category := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_category');
  
  has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');
  has_granular_permissions := can_view_expenses OR can_view_incomes;

  -- If user doesn't have manage_finance, enforce wallet-level access control
  IF NOT has_manage_finance THEN
    -- Optimization: Single set-based query to get allowed wallets and windows
    SELECT 
      array_agg(ww.id),
      jsonb_object_agg(ww.id::text, access_data.window_start_date)
    INTO v_allowed_wallet_ids, v_wallet_windows
    FROM public.workspace_wallets ww
    JOIN (
      SELECT 
        wrww.wallet_id,
        MIN(now() - (public.get_wallet_viewing_window_days(wrww.viewing_window, wrww.custom_days) || ' days')::interval) as window_start_date
      FROM public.workspace_roles wr
      JOIN public.workspace_role_members wrm ON wr.id = wrm.role_id
      JOIN public.workspace_role_wallet_whitelist wrww ON wr.id = wrww.role_id
      WHERE wr.ws_id = p_ws_id AND wrm.user_id = p_user_id
      GROUP BY wrww.wallet_id
    ) access_data ON ww.id = access_data.wallet_id
    WHERE ww.ws_id = p_ws_id;
    
    -- If user has no wallet access, return empty result
    IF v_allowed_wallet_ids IS NULL THEN
      RETURN;
    END IF;
    
    -- Override p_wallet_ids with allowed wallets only
    IF p_wallet_ids IS NOT NULL THEN
      p_wallet_ids := (
        SELECT array_agg(u)
        FROM unnest(p_wallet_ids) AS u
        WHERE u = ANY(v_allowed_wallet_ids)
      );
      
      -- If intersection is empty, return nothing
      IF p_wallet_ids IS NULL OR array_length(p_wallet_ids, 1) IS NULL THEN
        RETURN;
      END IF;
    ELSE
      p_wallet_ids := v_allowed_wallet_ids;
    END IF;
  END IF;

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

  -- Prepare filtered CTE logic
  v_filter_cte := '
    WITH filtered_transactions AS (
      SELECT 
        wt.id,
        wt.amount,
        wt.category_id,
        wt.created_at,
        wt.creator_id,
        wt.platform_creator_id,
        wt.description,
        wt.invoice_id,
        wt.report_opt_in,
        wt.taken_at,
        wt.wallet_id,
        wt.is_amount_confidential,
        wt.is_description_confidential,
        wt.is_category_confidential,
        ww.name as wallet_name
      FROM public.wallet_transactions wt
      JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
      WHERE ww.ws_id = $5
        -- Wallet Access Restrictions
        AND ($17 OR (wt.wallet_id = ANY($7) AND wt.taken_at >= COALESCE(($18->>wt.wallet_id::text)::timestamptz, ''-infinity''::timestamptz)))
        -- Permission Logic (Expenses/Incomes)
        AND (
          (NOT $21 AND $20)
          OR ($19 AND wt.amount < 0)
          OR ($22 AND wt.amount > 0)
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
    )';

  -- Get total count if requested (before pagination)
  IF p_include_count THEN
    EXECUTE v_filter_cte || ' SELECT COUNT(*) FROM filtered_transactions'
    INTO v_total_count
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
      has_manage_finance,           -- $17
      v_wallet_windows,             -- $18
      can_view_expenses,            -- $19
      can_view_transactions,        -- $20
      has_granular_permissions,     -- $21
      can_view_incomes;             -- $22
  END IF;

  -- Return query with all filters and pagination
  RETURN QUERY EXECUTE format(v_filter_cte || '
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
      wt.wallet_name,
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
    FROM filtered_transactions wt
    
    LEFT JOIN public.users u ON wt.platform_creator_id = u.id
    LEFT JOIN public.user_private_details upd ON wt.platform_creator_id = upd.user_id
    LEFT JOIN public.workspace_users wu ON wt.creator_id = wu.id
    
    LEFT JOIN public.finance_invoices fi ON wt.invoice_id = fi.id
    LEFT JOIN public.users u_inv ON fi.platform_creator_id = u_inv.id
    LEFT JOIN public.user_private_details upd_inv ON fi.platform_creator_id = upd_inv.user_id
    LEFT JOIN public.workspace_users wu_inv ON fi.creator_id = wu_inv.id
    
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
    has_manage_finance,           -- $17
    v_wallet_windows,             -- $18
    can_view_expenses,            -- $19
    can_view_transactions,        -- $20
    has_granular_permissions,     -- $21
    can_view_incomes;             -- $22
END;
$$;

-- 2. Restore/Update Sum and Count functions to respect permissions
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
  has_manage_finance boolean;
  has_granular boolean;
  result numeric;
BEGIN
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');

  has_granular := can_view_expenses OR can_view_incomes;

  -- Permission Check
  IF NOT has_manage_finance THEN
    IF has_granular AND NOT can_view_incomes THEN
      RETURN 0;
    ELSIF NOT has_granular AND NOT can_view_transactions THEN
      RETURN 0;
    END IF;
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
  has_manage_finance boolean;
  has_granular boolean;
  result bigint;
BEGIN
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');
  
  has_granular := can_view_expenses OR can_view_incomes;

  IF NOT has_manage_finance THEN
    IF has_granular AND NOT can_view_incomes THEN
      RETURN 0;
    ELSIF NOT has_granular AND NOT can_view_transactions THEN
      RETURN 0;
    END IF;
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
  has_manage_finance boolean;
  has_granular boolean;
  result numeric;
BEGIN
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');

  has_granular := can_view_expenses OR can_view_incomes;

  IF NOT has_manage_finance THEN
    IF has_granular AND NOT can_view_expenses THEN
      RETURN 0;
    ELSIF NOT has_granular AND NOT can_view_transactions THEN
      RETURN 0;
    END IF;
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
  has_manage_finance boolean;
  has_granular boolean;
  result bigint;
BEGIN
  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');
  
  has_granular := can_view_expenses OR can_view_incomes;

  IF NOT has_manage_finance THEN
    IF has_granular AND NOT can_view_expenses THEN
      RETURN 0;
    ELSIF NOT has_granular AND NOT can_view_transactions THEN
      RETURN 0;
    END IF;
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
  has_manage_finance boolean;
  has_granular boolean;
  result numeric;
BEGIN
  can_view_transactions := public.has_workspace_permission(ws_id, auth.uid(), 'view_transactions');
  can_view_expenses := public.has_workspace_permission(ws_id, auth.uid(), 'view_expenses');
  can_view_incomes := public.has_workspace_permission(ws_id, auth.uid(), 'view_incomes');
  can_view_amount := public.has_workspace_permission(ws_id, auth.uid(), 'view_confidential_amount');
  has_manage_finance := public.has_workspace_permission(ws_id, auth.uid(), 'manage_finance');

  has_granular := can_view_expenses OR can_view_incomes;

  IF NOT has_manage_finance THEN
    IF has_granular AND NOT can_view_incomes THEN
      RETURN 0;
    ELSIF NOT has_granular AND NOT can_view_transactions THEN
      RETURN 0;
    END IF;
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
  has_manage_finance boolean;
  has_granular boolean;
  result numeric;
BEGIN
  can_view_transactions := public.has_workspace_permission(ws_id, auth.uid(), 'view_transactions');
  can_view_expenses := public.has_workspace_permission(ws_id, auth.uid(), 'view_expenses');
  can_view_incomes := public.has_workspace_permission(ws_id, auth.uid(), 'view_incomes');
  can_view_amount := public.has_workspace_permission(ws_id, auth.uid(), 'view_confidential_amount');
  has_manage_finance := public.has_workspace_permission(ws_id, auth.uid(), 'manage_finance');

  has_granular := can_view_expenses OR can_view_incomes;

  IF NOT has_manage_finance THEN
    IF has_granular AND NOT can_view_expenses THEN
      RETURN 0;
    ELSIF NOT has_granular AND NOT can_view_transactions THEN
      RETURN 0;
    END IF;
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
