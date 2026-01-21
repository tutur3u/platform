-- Migration: fix_wallet_id_ambiguity_in_rpc_final
-- Fix ambiguous column reference error in get_wallet_transactions_with_permissions

DROP FUNCTION IF EXISTS public.get_wallet_transactions_with_permissions(uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, timestamp with time zone, timestamp with time zone, text, text, integer, integer, timestamp with time zone, timestamp with time zone, boolean);

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
  can_view_amount boolean;
  can_view_description boolean;
  can_view_category boolean;
  has_manage_finance boolean;
  v_total_count bigint := NULL;
  v_order_clause text;
  v_allowed_wallet_ids uuid[];
  v_wallet_access RECORD;
  v_wallet_windows JSONB := '{}';
BEGIN
  -- Check user's permissions for viewing confidential fields
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  can_view_description := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_description');
  can_view_category := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_category');
  
  -- CRITICAL: Check if user has manage_finance permission
  has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');
  
  -- If user doesn't have manage_finance, enforce wallet-level access control
  IF NOT has_manage_finance THEN
    -- Get all wallets in the workspace
    FOR v_wallet_access IN 
      SELECT ww.id as wallet_id
      FROM public.workspace_wallets ww
      WHERE ww.ws_id = p_ws_id
    LOOP
      DECLARE
        v_access_info RECORD;
      BEGIN
        -- Check if user has access to this wallet via role whitelist
        SELECT * INTO v_access_info
        FROM public.user_has_wallet_access_via_role(p_user_id, v_wallet_access.wallet_id, p_ws_id);
        
        IF v_access_info.has_access THEN
          -- Add to allowed wallets
          v_allowed_wallet_ids := array_append(v_allowed_wallet_ids, v_wallet_access.wallet_id);
          
          -- Store the window start date for this wallet
          v_wallet_windows := v_wallet_windows || jsonb_build_object(
            v_wallet_access.wallet_id::text,
            v_access_info.window_start_date
          );
        END IF;
      END;
    END LOOP;
    
    -- If user has no wallet access, return empty result
    IF v_allowed_wallet_ids IS NULL OR array_length(v_allowed_wallet_ids, 1) IS NULL THEN
      RETURN;
    END IF;
    
    -- Override p_wallet_ids with allowed wallets only
    -- If p_wallet_ids was provided, intersect with allowed wallets
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

  -- Get total count if requested (before pagination)
  IF p_include_count THEN
    IF has_manage_finance THEN
      -- No wallet restrictions for users with manage_finance
      SELECT COUNT(*)
      INTO v_total_count
      FROM public.wallet_transactions wt
      JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
      WHERE ww.ws_id = p_ws_id
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
    ELSE
      -- Apply wallet access restrictions and rolling window
      SELECT COUNT(*)
      INTO v_total_count
      FROM public.wallet_transactions wt
      JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
      WHERE ww.ws_id = p_ws_id
        AND wt.wallet_id = ANY(p_wallet_ids) -- Only allowed wallets
        AND (p_transaction_ids IS NULL OR wt.id = ANY(p_transaction_ids))
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
        )
        -- Apply rolling window per wallet
        AND (
          wt.taken_at >= (v_wallet_windows->>wt.wallet_id::text)::timestamptz
        );
    END IF;
  END IF;

  -- Return query with all filters and pagination
  IF has_manage_finance THEN
    -- No wallet restrictions for users with manage_finance
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
      p_offset;                     -- $16
  ELSE
    -- Apply wallet access restrictions and rolling window
    RETURN QUERY
    SELECT
      wt.id,
      CASE 
        WHEN wt.is_amount_confidential AND NOT can_view_amount THEN NULL
        ELSE wt.amount
      END AS amount,
      CASE 
        WHEN wt.is_category_confidential AND NOT can_view_category THEN NULL
        ELSE wt.category_id
      END AS category_id,
      wt.created_at,
      wt.creator_id,
      wt.platform_creator_id,
      CASE 
        WHEN wt.is_description_confidential AND NOT can_view_description THEN '[CONFIDENTIAL]'
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
      v_total_count AS total_count
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
    LEFT JOIN public.users u ON wt.platform_creator_id = u.id
    LEFT JOIN public.user_private_details upd ON wt.platform_creator_id = upd.user_id
    LEFT JOIN public.workspace_users wu ON wt.creator_id = wu.id
    LEFT JOIN public.finance_invoices fi ON wt.invoice_id = fi.id
    LEFT JOIN public.users u_inv ON fi.platform_creator_id = u_inv.id
    LEFT JOIN public.user_private_details upd_inv ON fi.platform_creator_id = upd_inv.user_id
    LEFT JOIN public.workspace_users wu_inv ON fi.creator_id = wu_inv.id
    WHERE ww.ws_id = p_ws_id
      AND wt.wallet_id = ANY(p_wallet_ids) -- Only allowed wallets
      AND (p_transaction_ids IS NULL OR wt.id = ANY(p_transaction_ids))
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
      )
      -- Apply rolling window using explicit column reference
      AND wt.taken_at >= COALESCE((v_wallet_windows->>wt.wallet_id::text)::timestamptz, '-infinity'::timestamptz)
    ORDER BY
      CASE WHEN p_order_by = 'taken_at' AND p_order_direction = 'DESC' THEN wt.taken_at END DESC,
      CASE WHEN p_order_by = 'taken_at' AND p_order_direction = 'ASC' THEN wt.taken_at END ASC,
      CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'DESC' THEN wt.created_at END DESC,
      CASE WHEN p_order_by = 'created_at' AND p_order_direction = 'ASC' THEN wt.created_at END ASC,
      CASE WHEN p_order_by = 'amount' AND p_order_direction = 'DESC' THEN wt.amount END DESC,
      CASE WHEN p_order_by = 'amount' AND p_order_direction = 'ASC' THEN wt.amount END ASC,
      wt.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_transactions_with_permissions(
  uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, timestamp with time zone, timestamp with time zone,
  text, text, integer, integer, timestamp with time zone, timestamp with time zone, boolean
) TO authenticated;

COMMENT ON FUNCTION public.get_wallet_transactions_with_permissions IS
  'Returns wallet transactions with permission-based field redaction and wallet-level access control. 
  Users with manage_finance see all wallets. Users without manage_finance only see transactions from 
  wallets they have access to via role whitelist, with rolling window restrictions applied per wallet.
  Fixed: Removed ambiguous column reference in wallet access subquery.';
