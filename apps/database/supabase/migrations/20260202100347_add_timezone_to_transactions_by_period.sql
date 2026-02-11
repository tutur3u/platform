-- Migration: add_timezone_to_transactions_by_period
-- Adds timezone parameter to get_transactions_by_period for correct period grouping
-- This fixes the mismatch where server groups by UTC but frontend displays local time labels

-- First, drop the old function signature to avoid ambiguity
DROP FUNCTION IF EXISTS public.get_transactions_by_period(
  uuid, text, uuid, uuid[], uuid[], uuid[], uuid[], text,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, integer
);

CREATE OR REPLACE FUNCTION public.get_transactions_by_period(
  -- Required parameters
  p_ws_id uuid,
  p_interval text DEFAULT 'daily',  -- 'daily', 'weekly', 'monthly', 'yearly'

  -- Optional user ID (defaults to current user)
  p_user_id uuid DEFAULT auth.uid(),

  -- Filtering parameters
  p_wallet_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_creator_ids uuid[] DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date timestamp with time zone DEFAULT NULL,

  -- Pagination parameters (cursor-based by period)
  p_cursor_period_start timestamp with time zone DEFAULT NULL,
  p_limit integer DEFAULT 10,

  -- Timezone parameter for period grouping
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  total_income numeric,
  total_expense numeric,
  net_total numeric,
  transaction_count bigint,
  has_redacted_amounts boolean,
  transactions jsonb,
  has_more boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_can_view_transactions boolean;
  v_can_view_expenses boolean;
  v_can_view_incomes boolean;
  v_can_view_amount boolean;
  v_can_view_description boolean;
  v_can_view_category boolean;
  v_has_manage_finance boolean;
  v_has_granular_permissions boolean;
  v_allowed_wallet_ids uuid[];
  v_wallet_windows JSONB := '{}';
  v_trunc_interval text;
  v_interval_text text;
  v_validated_timezone text;
BEGIN
  -- Validate p_interval
  IF p_interval NOT IN ('daily', 'weekly', 'monthly', 'yearly') THEN
    p_interval := 'daily';
  END IF;

  -- Validate timezone - fall back to UTC if invalid
  BEGIN
    -- Test if timezone is valid by trying to use it
    PERFORM now() AT TIME ZONE p_timezone;
    v_validated_timezone := p_timezone;
  EXCEPTION WHEN OTHERS THEN
    v_validated_timezone := 'UTC';
  END;

  -- Map to PostgreSQL date_trunc interval
  CASE p_interval
    WHEN 'daily' THEN
      v_trunc_interval := 'day';
      v_interval_text := '1 day';
    WHEN 'weekly' THEN
      v_trunc_interval := 'week';
      v_interval_text := '1 week';
    WHEN 'monthly' THEN
      v_trunc_interval := 'month';
      v_interval_text := '1 month';
    WHEN 'yearly' THEN
      v_trunc_interval := 'year';
      v_interval_text := '1 year';
  END CASE;

  -- Permission checks
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    IF NOT public.has_workspace_permission(p_ws_id, auth.uid(), 'manage_workspace_roles') THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  v_can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  v_can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  v_can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  v_can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  v_can_view_description := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_description');
  v_can_view_category := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_category');
  v_has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');
  v_has_granular_permissions := v_can_view_expenses OR v_can_view_incomes;

  -- Wallet access control (same as get_wallet_transactions_with_permissions)
  IF NOT v_has_manage_finance THEN
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

    IF v_allowed_wallet_ids IS NULL THEN
      RETURN;
    END IF;

    IF p_wallet_ids IS NOT NULL THEN
      p_wallet_ids := (
        SELECT array_agg(u)
        FROM unnest(p_wallet_ids) AS u
        WHERE u = ANY(v_allowed_wallet_ids)
      );
      IF p_wallet_ids IS NULL OR array_length(p_wallet_ids, 1) IS NULL THEN
        RETURN;
      END IF;
    ELSE
      p_wallet_ids := v_allowed_wallet_ids;
    END IF;
  END IF;

  RETURN QUERY
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
      ww.name as wallet_name,
      tc.name as category_name,
      tc.icon as category_icon,
      tc.color as category_color,
      -- Convert to target timezone before truncating to get correct local day/week/month boundaries
      date_trunc(v_trunc_interval, wt.taken_at AT TIME ZONE v_validated_timezone) as period_bucket
    FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
    LEFT JOIN public.transaction_categories tc ON wt.category_id = tc.id
    WHERE ww.ws_id = p_ws_id
      -- Wallet Access Restrictions
      AND (v_has_manage_finance OR (
        wt.wallet_id = ANY(v_allowed_wallet_ids)
        AND wt.taken_at >= COALESCE((v_wallet_windows->>wt.wallet_id::text)::timestamptz, '-infinity'::timestamptz)
      ))
      -- Permission Logic (Expenses/Incomes)
      AND (
        (NOT v_has_granular_permissions AND v_can_view_transactions)
        OR (v_can_view_expenses AND wt.amount < 0)
        OR (v_can_view_incomes AND wt.amount > 0)
      )
      AND (p_wallet_ids IS NULL OR wt.wallet_id = ANY(p_wallet_ids))
      AND (p_category_ids IS NULL OR wt.category_id = ANY(p_category_ids))
      AND (p_creator_ids IS NULL OR (wt.creator_id = ANY(p_creator_ids) OR wt.platform_creator_id = ANY(p_creator_ids)))
      AND (p_start_date IS NULL OR wt.taken_at >= p_start_date)
      AND (p_end_date IS NULL OR wt.taken_at <= p_end_date)
      AND (p_search_query IS NULL OR wt.description ILIKE '%' || p_search_query || '%')
      -- Tag filter
      AND (p_tag_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.wallet_transaction_tags wtt
        WHERE wtt.transaction_id = wt.id AND wtt.tag_id = ANY(p_tag_ids)
      ))
  ),
  period_aggregates AS (
    SELECT
      ft.period_bucket,
      -- Convert the truncated local time back to timestamptz for consistent output
      (ft.period_bucket AT TIME ZONE v_validated_timezone) + (v_interval_text)::interval as period_end_calc,
      COUNT(*) as tx_count,
      COALESCE(SUM(CASE WHEN ft.amount > 0 AND (NOT ft.is_amount_confidential OR v_can_view_amount) THEN ft.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN ft.amount < 0 AND (NOT ft.is_amount_confidential OR v_can_view_amount) THEN ft.amount ELSE 0 END), 0) as expense,
      COALESCE(SUM(CASE WHEN NOT ft.is_amount_confidential OR v_can_view_amount THEN ft.amount ELSE 0 END), 0) as net,
      bool_or(ft.is_amount_confidential AND NOT v_can_view_amount) as has_redacted,
      jsonb_agg(
        jsonb_build_object(
          'id', ft.id,
          'amount', CASE WHEN ft.is_amount_confidential AND NOT v_can_view_amount THEN NULL ELSE ft.amount END,
          'category_id', CASE WHEN ft.is_category_confidential AND NOT v_can_view_category THEN NULL ELSE ft.category_id END,
          'category', CASE WHEN ft.is_category_confidential AND NOT v_can_view_category THEN NULL ELSE ft.category_name END,
          'category_icon', CASE WHEN ft.is_category_confidential AND NOT v_can_view_category THEN NULL ELSE ft.category_icon END,
          'category_color', CASE WHEN ft.is_category_confidential AND NOT v_can_view_category THEN NULL ELSE ft.category_color END,
          'wallet_id', ft.wallet_id,
          'wallet', ft.wallet_name,
          'description', CASE WHEN ft.is_description_confidential AND NOT v_can_view_description THEN '[CONFIDENTIAL]' ELSE ft.description END,
          'taken_at', ft.taken_at,
          'created_at', ft.created_at,
          'creator_id', ft.creator_id,
          'platform_creator_id', ft.platform_creator_id,
          'invoice_id', ft.invoice_id,
          'report_opt_in', ft.report_opt_in,
          'is_amount_confidential', ft.is_amount_confidential,
          'is_description_confidential', ft.is_description_confidential,
          'is_category_confidential', ft.is_category_confidential
        ) ORDER BY ft.taken_at DESC, ft.created_at DESC
      ) as tx_array
    FROM filtered_transactions ft
    GROUP BY ft.period_bucket
  ),
  paginated_periods AS (
    SELECT
      pa.*,
      ROW_NUMBER() OVER (ORDER BY pa.period_bucket DESC) as rn
    FROM period_aggregates pa
    WHERE p_cursor_period_start IS NULL
      OR (pa.period_bucket AT TIME ZONE v_validated_timezone) < p_cursor_period_start
    ORDER BY pa.period_bucket DESC
    LIMIT p_limit + 1
  )
  SELECT
    -- Convert back to timestamptz for output (representing the start of the period in the target timezone)
    pp.period_bucket AT TIME ZONE v_validated_timezone as period_start,
    pp.period_end_calc as period_end,
    pp.income as total_income,
    pp.expense as total_expense,
    pp.net as net_total,
    pp.tx_count as transaction_count,
    pp.has_redacted as has_redacted_amounts,
    pp.tx_array as transactions,
    (SELECT COUNT(*) > p_limit FROM paginated_periods) as has_more
  FROM paginated_periods pp
  WHERE pp.rn <= p_limit
  ORDER BY pp.period_bucket DESC;
END;
$$;

-- Grant execute permission for the new function signature
GRANT EXECUTE ON FUNCTION public.get_transactions_by_period(
  uuid, text, uuid, uuid[], uuid[], uuid[], uuid[], text,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, integer, text
) TO authenticated;

-- Add descriptive comment for the function
COMMENT ON FUNCTION public.get_transactions_by_period(
  uuid, text, uuid, uuid[], uuid[], uuid[], uuid[], text,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, integer, text
) IS
'Returns transactions grouped by period (day/week/month/year) with aggregated statistics.
Supports timezone-aware period grouping via p_timezone parameter.
Uses cursor-based pagination by period_start for infinite scroll.

Parameters:
  p_timezone: IANA timezone identifier (e.g., "America/New_York", "Asia/Ho_Chi_Minh").
              Defaults to "UTC". Invalid values fall back to UTC.
              Period boundaries are calculated in this timezone, ensuring transactions
              are grouped by local day/week/month, not UTC.';
