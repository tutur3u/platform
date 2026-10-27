-- Require an authorized caller for finance read RPCs that are SECURITY DEFINER.
--
-- 1. search_finance_invoices and get_invoice_totals_by_date_range: Finance
--    server routes call them through the service-role client after checking
--    `view_invoices`. Direct Data API callers must now be signed in and hold
--    `view_invoices` in the requested workspace; service_role is unchanged.
--    Bodies are otherwise identical to 20260717160000 (search) and
--    20260127025639 (totals), with every relation schema-qualified so the
--    search_path can be pinned.
-- 2. Wallet and transaction read RPCs that take `p_user_id`: only that user or
--    the service role may call them (every caller passes the signed-in user).
--
-- Rollback: apps/database/rollbacks/20261027032500_guard_finance_read_rpcs.rollback.sql
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.search_finance_invoices(
  p_ws_id uuid,
  p_search_query text,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_user_ids uuid[] default null,
  p_wallet_ids uuid[] default null,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  ws_id uuid,
  customer_id uuid,
  notice text,
  note text,
  price numeric,
  total_diff numeric,
  created_at timestamptz,
  creator_id uuid,
  platform_creator_id uuid,
  transaction_id uuid,
  customer_full_name text,
  customer_avatar_url text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_total_count bigint;
  v_escaped_query text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and (
      auth.uid() is null
      or not public.has_workspace_permission(
        p_ws_id,
        auth.uid(),
        'view_invoices'
      )
    )
  then
    raise exception 'Insufficient permissions to view invoices'
      using errcode = '42501';
  end if;

  v_escaped_query := replace(replace(replace(p_search_query, '\', '\\'), '%', '\%'), '_', '\_');

  with filtered_invoices as (
    select distinct
      fi.id,
      fi.ws_id,
      fi.customer_id,
      fi.notice,
      fi.note,
      fi.price,
      fi.total_diff,
      fi.created_at,
      fi.creator_id,
      fi.platform_creator_id,
      fi.transaction_id,
      wu.full_name as customer_full_name,
      wu.avatar_url as customer_avatar_url
    from public.finance_invoices fi
    left join public.workspace_users wu
      on fi.customer_id = wu.id
      and fi.ws_id = wu.ws_id
    left join public.wallet_transactions wt on fi.transaction_id = wt.id
    where fi.ws_id = p_ws_id
      and (
        p_search_query is null or p_search_query = '' or
        fi.notice ilike '%' || v_escaped_query || '%' escape '\' or
        fi.note ilike '%' || v_escaped_query || '%' escape '\' or
        wu.full_name ilike '%' || v_escaped_query || '%' escape '\'
      )
      and (p_start_date is null or fi.created_at >= p_start_date)
      and (p_end_date is null or fi.created_at <= p_end_date)
      and (p_user_ids is null or fi.creator_id = any(p_user_ids))
      and (p_wallet_ids is null or wt.wallet_id = any(p_wallet_ids))
  )
  select count(*) into v_total_count from filtered_invoices;

  return query
  with filtered_invoices as (
    select distinct
      fi.id,
      fi.ws_id,
      fi.customer_id,
      fi.notice,
      fi.note,
      fi.price,
      fi.total_diff,
      fi.created_at,
      fi.creator_id,
      fi.platform_creator_id,
      fi.transaction_id,
      wu.full_name as customer_full_name,
      wu.avatar_url as customer_avatar_url
    from public.finance_invoices fi
    left join public.workspace_users wu
      on fi.customer_id = wu.id
      and fi.ws_id = wu.ws_id
    left join public.wallet_transactions wt on fi.transaction_id = wt.id
    where fi.ws_id = p_ws_id
      and (
        p_search_query is null or p_search_query = '' or
        fi.notice ilike '%' || v_escaped_query || '%' escape '\' or
        fi.note ilike '%' || v_escaped_query || '%' escape '\' or
        wu.full_name ilike '%' || v_escaped_query || '%' escape '\'
      )
      and (p_start_date is null or fi.created_at >= p_start_date)
      and (p_end_date is null or fi.created_at <= p_end_date)
      and (p_user_ids is null or fi.creator_id = any(p_user_ids))
      and (p_wallet_ids is null or wt.wallet_id = any(p_wallet_ids))
  )
  select
    fi_results.id,
    fi_results.ws_id,
    fi_results.customer_id,
    fi_results.notice,
    fi_results.note,
    fi_results.price,
    fi_results.total_diff,
    fi_results.created_at,
    fi_results.creator_id,
    fi_results.platform_creator_id,
    fi_results.transaction_id,
    fi_results.customer_full_name,
    fi_results.customer_avatar_url,
    v_total_count as total_count
  from filtered_invoices fi_results
  order by fi_results.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.get_invoice_totals_by_date_range(
  _ws_id uuid,
  start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  wallet_ids uuid[] DEFAULT NULL::uuid[],
  user_ids uuid[] DEFAULT NULL::uuid[],
  group_by_creator boolean DEFAULT false,
  week_start_day integer DEFAULT 1,
  interval_type text DEFAULT NULL::text
)
 RETURNS TABLE(
  period date,
  group_id uuid,
  group_name text,
  group_avatar_url text,
  total_amount numeric,
  invoice_count bigint
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  _start_date TIMESTAMPTZ;
  _end_date TIMESTAMPTZ;
  _day_count INT;
  _interval_type TEXT;
BEGIN
  if coalesce(auth.role(), '') <> 'service_role'
    and (
      auth.uid() is null
      or not public.has_workspace_permission(
        _ws_id,
        auth.uid(),
        'view_invoices'
      )
    )
  then
    raise exception 'Insufficient permissions to view invoices'
      using errcode = '42501';
  end if;

  -- Default to last 14 days if no date range specified
  _end_date := COALESCE(end_date, CURRENT_DATE::TIMESTAMPTZ);
  _start_date := COALESCE(start_date, _end_date - INTERVAL '13 days');

  -- Calculate the number of days in the range (using date portion for day count)
  _day_count := (_end_date::DATE - _start_date::DATE) + 1;

  -- Determine interval type
  IF interval_type IS NOT NULL AND interval_type IN ('day', 'week', 'month') THEN
    _interval_type := interval_type;
  ELSE
    -- Auto-detect based on duration if interval_type is NULL or invalid
    IF _day_count <= 31 THEN
      _interval_type := 'day';
    ELSIF _day_count <= 90 THEN
      _interval_type := 'week';
    ELSE
      _interval_type := 'month';
    END IF;
  END IF;

  IF group_by_creator THEN
    -- Group by creator (Resolved User ID)
    RETURN QUERY
    WITH date_series AS (
      SELECT
        CASE _interval_type
          WHEN 'day' THEN gs::DATE
          WHEN 'week' THEN public.trunc_to_week_start(gs::TIMESTAMPTZ, week_start_day)
          WHEN 'month' THEN date_trunc('month', gs)::DATE
        END AS period_start
      FROM generate_series(
        CASE _interval_type
          WHEN 'day' THEN _start_date::TIMESTAMPTZ
          WHEN 'week' THEN public.trunc_to_week_start(_start_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ
          WHEN 'month' THEN date_trunc('month', _start_date::TIMESTAMPTZ)
        END,
        _end_date::TIMESTAMPTZ,
        CASE _interval_type
          WHEN 'day' THEN '1 day'::interval
          WHEN 'week' THEN '1 week'::interval
          WHEN 'month' THEN '1 month'::interval
        END
      ) AS gs
      GROUP BY 1
    ),
    relevant_creators AS (
      -- Get distinct creator IDs (resolved to Platform User ID where possible)
      SELECT DISTINCT
        COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) AS creator_id
      FROM public.finance_invoices fi
      LEFT JOIN public.workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
      WHERE fi.ws_id = _ws_id
        AND (
          user_ids IS NULL OR array_length(user_ids, 1) IS NULL
          OR fi.creator_id = ANY(user_ids)
          OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
        )
    ),
    creator_info AS (
      SELECT
        rc.creator_id,
        COALESCE(
          u.display_name,
          upd.full_name,
          wu.display_name,
          wu.full_name,
          'Unknown'
        ) AS creator_name,
        COALESCE(u.avatar_url, wu.avatar_url) AS avatar_url
      FROM relevant_creators rc
      LEFT JOIN public.users u ON rc.creator_id = u.id
      LEFT JOIN public.user_private_details upd ON u.id = upd.user_id
      LEFT JOIN public.workspace_users wu ON rc.creator_id = wu.id
    ),
    date_creator_combinations AS (
      SELECT ds.period_start, ci.creator_id, ci.creator_name, ci.avatar_url
      FROM date_series ds
      CROSS JOIN creator_info ci
    ),
    invoice_totals AS (
      SELECT
        CASE _interval_type
          WHEN 'day' THEN fi.created_at::DATE
          WHEN 'week' THEN public.trunc_to_week_start(fi.created_at, week_start_day)
          WHEN 'month' THEN date_trunc('month', fi.created_at)::DATE
        END AS period_start,
        COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) AS creator_id,
        SUM(fi.price)::NUMERIC AS total_amount,
        COUNT(*)::BIGINT AS invoice_count
      FROM public.finance_invoices fi
      LEFT JOIN public.wallet_transactions wt ON fi.transaction_id = wt.id
      LEFT JOIN public.workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
      WHERE fi.ws_id = _ws_id
        AND fi.created_at >= _start_date
        AND fi.created_at <= _end_date
        AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
        AND (
          user_ids IS NULL OR array_length(user_ids, 1) IS NULL
          OR fi.creator_id = ANY(user_ids)
          OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
        )
      GROUP BY 1, 2
    )
    SELECT
      dcc.period_start AS period,
      dcc.creator_id AS group_id,
      dcc.creator_name AS group_name,
      dcc.avatar_url AS group_avatar_url,
      COALESCE(it.total_amount, 0)::NUMERIC AS total_amount,
      COALESCE(it.invoice_count, 0)::BIGINT AS invoice_count
    FROM date_creator_combinations dcc
    LEFT JOIN invoice_totals it ON dcc.period_start = it.period_start AND dcc.creator_id IS NOT DISTINCT FROM it.creator_id
    ORDER BY dcc.period_start, dcc.creator_name;
  ELSE
    -- Group by wallet
    RETURN QUERY
    WITH date_series AS (
      SELECT
        CASE _interval_type
          WHEN 'day' THEN gs::DATE
          WHEN 'week' THEN public.trunc_to_week_start(gs::TIMESTAMPTZ, week_start_day)
          WHEN 'month' THEN date_trunc('month', gs)::DATE
        END AS period_start
      FROM generate_series(
        CASE _interval_type
          WHEN 'day' THEN _start_date::TIMESTAMPTZ
          WHEN 'week' THEN public.trunc_to_week_start(_start_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ
          WHEN 'month' THEN date_trunc('month', _start_date::TIMESTAMPTZ)
        END,
        _end_date::TIMESTAMPTZ,
        CASE _interval_type
          WHEN 'day' THEN '1 day'::interval
          WHEN 'week' THEN '1 week'::interval
          WHEN 'month' THEN '1 month'::interval
        END
      ) AS gs
      GROUP BY 1
    ),
    relevant_wallets AS (
      SELECT ww.id, ww.name
      FROM private.workspace_wallets ww
      WHERE ww.ws_id = _ws_id
        AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR ww.id = ANY(wallet_ids))
    ),
    date_wallet_combinations AS (
      SELECT ds.period_start, rw.id AS wallet_id, rw.name AS wallet_name
      FROM date_series ds
      CROSS JOIN relevant_wallets rw
    ),
    invoice_totals AS (
      SELECT
        CASE _interval_type
          WHEN 'day' THEN fi.created_at::DATE
          WHEN 'week' THEN public.trunc_to_week_start(fi.created_at, week_start_day)
          WHEN 'month' THEN date_trunc('month', fi.created_at)::DATE
        END AS period_start,
        wt.wallet_id,
        SUM(fi.price)::NUMERIC AS total_amount,
        COUNT(*)::BIGINT AS invoice_count
      FROM public.finance_invoices fi
      -- Use LEFT JOIN to consistently include invoices even if they lack linked transactions/wallets
      LEFT JOIN public.wallet_transactions wt ON fi.transaction_id = wt.id
      LEFT JOIN private.workspace_wallets ww ON wt.wallet_id = ww.id
      LEFT JOIN public.workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
      WHERE fi.ws_id = _ws_id
        AND fi.created_at >= _start_date
        AND fi.created_at <= _end_date
        AND (wallet_ids IS NULL OR array_length(wallet_ids, 1) IS NULL OR wt.wallet_id = ANY(wallet_ids))
        AND (
          user_ids IS NULL OR array_length(user_ids, 1) IS NULL
          OR fi.creator_id = ANY(user_ids)
          OR COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) = ANY(user_ids)
        )
      GROUP BY 1, 2
    )
    SELECT
      dwc.period_start AS period,
      dwc.wallet_id AS group_id,
      dwc.wallet_name AS group_name,
      NULL::TEXT AS group_avatar_url,
      COALESCE(it.total_amount, 0)::NUMERIC AS total_amount,
      COALESCE(it.invoice_count, 0)::BIGINT AS invoice_count
    FROM date_wallet_combinations dwc
    LEFT JOIN invoice_totals it ON dwc.period_start = it.period_start AND dwc.wallet_id = it.wallet_id
    ORDER BY dwc.period_start, dwc.wallet_name;
  END IF;
END;
$function$;

revoke all on function public.search_finance_invoices(uuid, text, timestamptz, timestamptz, uuid[], uuid[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_finance_invoices(uuid, text, timestamptz, timestamptz, uuid[], uuid[], integer, integer)
  to authenticated, service_role;

revoke all on function public.get_invoice_totals_by_date_range(uuid, timestamptz, timestamptz, uuid[], uuid[], boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.get_invoice_totals_by_date_range(uuid, timestamptz, timestamptz, uuid[], uuid[], boolean, integer, text)
  to authenticated, service_role;

-- Wallet and transaction read RPCs evaluate permissions for `p_user_id`. Their
-- impersonation guard (`p_user_id != auth.uid()`) is skipped when auth.uid()
-- is NULL. Rewrite the live definitions so only the named user or the service
-- role may call them, pin the search_path (every relation is already
-- schema-qualified) and drop PUBLIC/anon EXECUTE. Each definition must contain
-- the expected guard exactly once or the migration aborts.
do $$
declare
  v_target regprocedure;
  v_definition text;
  v_old_guard constant text :=
    'IF p_user_id IS NOT NULL AND p_user_id != auth\.uid\(\) THEN\s+'
    || 'IF NOT public\.has_workspace_permission\((p_ws_id|ws_id), auth\.uid\(\), '
    || '''manage_workspace_roles''\) THEN\s+'
    || 'RAISE EXCEPTION ''Permission denied'';\s+END IF;\s+END IF;';
  v_new_guard constant text :=
    'IF COALESCE(auth.role(), '''') <> ''service_role''
    AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION ''Permission denied'' USING ERRCODE = ''42501'';
  END IF;';
begin
  foreach v_target in array array[
    'public.get_wallet_permission_context(uuid,uuid)',
    'public.get_wallet_income_sum(uuid,uuid,boolean)',
    'public.get_wallet_income_count(uuid,uuid,boolean)',
    'public.get_wallet_expense_sum(uuid,uuid,boolean)',
    'public.get_wallet_expense_count(uuid,uuid,boolean)',
    'public.get_workspace_wallets_income(uuid,uuid,timestamptz,timestamptz,boolean)',
    'public.get_workspace_wallets_expense(uuid,uuid,timestamptz,timestamptz,boolean)',
    'public.get_transactions_by_period(uuid,text,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz,timestamptz,integer,text)',
    'public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz,text,text,integer,integer,timestamptz,timestamptz,boolean,timestamptz)'
  ]::regprocedure[]
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_target);

    if pg_catalog.regexp_count(v_definition, v_old_guard) <> 1 then
      raise exception 'Unexpected actor guard in %', v_target;
    end if;

    execute pg_catalog.regexp_replace(v_definition, v_old_guard, v_new_guard);
    execute format(
      'alter function %s set search_path = pg_catalog, pg_temp',
      v_target
    );
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_target
    );
    execute format(
      'grant execute on function %s to authenticated, service_role',
      v_target
    );
  end loop;
end;
$$;

-- Legacy overloads with no actor check. PostgREST cannot select them (a newer
-- overload accepts the same keys) and no caller uses them; keep them for
-- service_role only.
do $$
declare
  v_target regprocedure;
begin
  foreach v_target in array array[
    'public.get_wallet_income_sum(uuid,uuid)',
    'public.get_wallet_income_count(uuid,uuid)',
    'public.get_wallet_expense_sum(uuid,uuid)',
    'public.get_wallet_expense_count(uuid,uuid)',
    'public.get_workspace_wallets_income(uuid,timestamptz,timestamptz,boolean)',
    'public.get_workspace_wallets_expense(uuid,timestamptz,timestamptz,boolean)'
  ]::regprocedure[]
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, pg_temp',
      v_target
    );
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_target
    );
    execute format('grant execute on function %s to service_role', v_target);
  end loop;
end;
$$;
