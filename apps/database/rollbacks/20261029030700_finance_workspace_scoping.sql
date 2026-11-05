-- Exact prior RPC bodies and policies; existing ACLs are retained.
begin;
CREATE OR REPLACE FUNCTION public.get_wallet_transactions_with_permissions(p_ws_id uuid, p_user_id uuid DEFAULT auth.uid(), p_transaction_ids uuid[] DEFAULT NULL::uuid[], p_wallet_ids uuid[] DEFAULT NULL::uuid[], p_category_ids uuid[] DEFAULT NULL::uuid[], p_creator_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[], p_transaction_type text DEFAULT NULL::text, p_search_query text DEFAULT NULL::text, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_order_by text DEFAULT 'taken_at'::text, p_order_direction text DEFAULT 'DESC'::text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0, p_cursor_taken_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_include_count boolean DEFAULT false, p_created_at_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, amount numeric, category_id uuid, category_name text, category_icon text, category_color text, created_at timestamp with time zone, creator_id uuid, platform_creator_id uuid, description text, invoice_id uuid, report_opt_in boolean, taken_at timestamp with time zone, wallet_id uuid, wallet_name text, creator_full_name text, creator_email text, creator_avatar_url text, is_amount_confidential boolean, is_description_confidential boolean, is_category_confidential boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
  v_wallet_windows JSONB := '{}';
  v_filter_cte text;
BEGIN
  IF p_transaction_type NOT IN ('income', 'expense') THEN
    p_transaction_type := NULL;
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
    AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  can_view_transactions := public.has_workspace_permission(p_ws_id, p_user_id, 'view_transactions');
  can_view_expenses := public.has_workspace_permission(p_ws_id, p_user_id, 'view_expenses');
  can_view_incomes := public.has_workspace_permission(p_ws_id, p_user_id, 'view_incomes');
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  can_view_description := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_description');
  can_view_category := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_category');
  has_manage_finance := public.has_workspace_permission(p_ws_id, p_user_id, 'manage_finance');
  has_granular_permissions := can_view_expenses OR can_view_incomes;

  IF NOT has_manage_finance THEN
    SELECT
      array_agg(ww.id),
      jsonb_object_agg(ww.id::text, access_data.window_start_date)
    INTO v_allowed_wallet_ids, v_wallet_windows
    FROM private.workspace_wallets ww
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

  IF p_order_by NOT IN ('taken_at', 'created_at', 'amount') THEN
    p_order_by := 'taken_at';
  END IF;

  IF p_order_direction NOT IN ('ASC', 'DESC') THEN
    p_order_direction := 'DESC';
  END IF;

  IF p_order_by = 'taken_at' THEN
    v_order_clause := format('wt.taken_at %s, wt.created_at %s', p_order_direction, p_order_direction);
  ELSIF p_order_by = 'created_at' THEN
    v_order_clause := format('wt.created_at %s, wt.id %s', p_order_direction, p_order_direction);
  ELSIF p_order_by = 'amount' THEN
    v_order_clause := format('wt.amount %s, wt.taken_at %s', p_order_direction, p_order_direction);
  END IF;

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
        ww.name as wallet_name,
        tc.name as category_name,
        tc.icon as category_icon,
        tc.color as category_color
      FROM public.wallet_transactions wt
      JOIN private.workspace_wallets ww ON wt.wallet_id = ww.id
      LEFT JOIN public.transaction_categories tc ON wt.category_id = tc.id
      WHERE ww.ws_id = $5
        AND ($18 OR (wt.wallet_id = ANY($7) AND wt.taken_at >= COALESCE(($19->>wt.wallet_id::text)::timestamptz, ''-infinity''::timestamptz)))
        AND (
          (NOT $22 AND $21)
          OR ($20 AND wt.amount < 0)
          OR ($23 AND wt.amount > 0)
        )
        AND ($6::uuid[] IS NULL OR wt.id = ANY($6))
        AND ($7::uuid[] IS NULL OR wt.wallet_id = ANY($7))
        AND ($8::uuid[] IS NULL OR wt.category_id = ANY($8))
        AND ($9::uuid[] IS NULL OR (wt.creator_id = ANY($9) OR wt.platform_creator_id = ANY($9)))
        AND ($11::timestamp with time zone IS NULL OR wt.taken_at >= $11)
        AND ($12::timestamp with time zone IS NULL OR wt.taken_at <= $12)
        AND ($25::timestamp with time zone IS NULL OR wt.created_at <= $25)
        AND (
          $13::text IS NULL
          OR wt.description ILIKE ''%%'' || $13 || ''%%''
        )
        AND ($10::uuid[] IS NULL OR EXISTS (
          SELECT 1 FROM public.wallet_transaction_tags wtt
          WHERE wtt.transaction_id = wt.id AND wtt.tag_id = ANY($10)
        ))
        AND (
          $24::text IS NULL
          OR (
            ($1 OR NOT wt.is_amount_confidential)
            AND (
              ($24 = ''income'' AND wt.amount > 0)
              OR ($24 = ''expense'' AND wt.amount < 0)
            )
          )
        )';

  IF p_order_by = 'taken_at' THEN
    v_filter_cte := v_filter_cte || '
        AND (
          $14::timestamp with time zone IS NULL
          OR $15::timestamp with time zone IS NULL
          OR (
            wt.taken_at < $14
            OR (wt.taken_at = $14 AND wt.created_at < $15)
          )
        )';
  END IF;

  v_filter_cte := v_filter_cte || '
    )';

  IF p_include_count THEN
    EXECUTE v_filter_cte || ' SELECT COUNT(*) FROM filtered_transactions'
    INTO v_total_count
    USING
      can_view_amount,
      can_view_category,
      can_view_description,
      v_total_count,
      p_ws_id,
      p_transaction_ids,
      p_wallet_ids,
      p_category_ids,
      p_creator_ids,
      p_tag_ids,
      p_start_date,
      p_end_date,
      p_search_query,
      p_cursor_taken_at,
      p_cursor_created_at,
      p_limit,
      p_offset,
      has_manage_finance,
      v_wallet_windows,
      can_view_expenses,
      can_view_transactions,
      has_granular_permissions,
      can_view_incomes,
      p_transaction_type, p_created_at_until;
  END IF;

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
      CASE
        WHEN wt.is_category_confidential AND NOT $2 THEN NULL
        ELSE wt.category_name
      END AS category_name,
      CASE
        WHEN wt.is_category_confidential AND NOT $2 THEN NULL
        ELSE wt.category_icon
      END AS category_icon,
      CASE
        WHEN wt.is_category_confidential AND NOT $2 THEN NULL
        ELSE wt.category_color
      END AS category_color,
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
    LIMIT $16
    OFFSET $17
  ', v_order_clause)
  USING
    can_view_amount,
    can_view_category,
    can_view_description,
    v_total_count,
    p_ws_id,
    p_transaction_ids,
    p_wallet_ids,
    p_category_ids,
    p_creator_ids,
    p_tag_ids,
    p_start_date,
    p_end_date,
    p_search_query,
    p_cursor_taken_at,
    p_cursor_created_at,
    p_limit,
    p_offset,
    has_manage_finance,
    v_wallet_windows,
    can_view_expenses,
    can_view_transactions,
    has_granular_permissions,
    can_view_incomes,
    p_transaction_type, p_created_at_until;
END;
$function$;

revoke all on function get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,text,text,integer,integer,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone) from public, anon;

CREATE OR REPLACE FUNCTION public.get_transaction_categories_with_amount_by_workspace(p_ws_id uuid)
 RETURNS TABLE(id uuid, name text, description text, is_expense boolean, ws_id uuid, created_at timestamp with time zone, icon text, color text, amount numeric, transaction_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
select
    tc.id,
    tc.name,
    tc.description,
    tc.is_expense,
    tc.ws_id,
    tc.created_at,
    tc.icon,
    tc.color,
    coalesce(sum(abs(wt.amount)), 0) as amount,
    count(wt.id) as transaction_count
from public.transaction_categories tc
left join public.wallet_transactions wt on wt.category_id = tc.id
where tc.ws_id = p_ws_id
group by
    tc.id,
    tc.name,
    tc.description,
    tc.is_expense,
    tc.ws_id,
    tc.created_at,
    tc.icon,
    tc.color
order by tc.name asc
$function$;

-- The final pre-migration schema has no permissive client transaction policies or client grants.
commit;
