-- Rollback for 20261027032500_guard_finance_read_rpcs.sql.
-- Restores the previous function bodies, actor guards and search_path settings:
--   search_finance_invoices          -> 20260717160000 body, search_path = public
--   get_invoice_totals_by_date_range -> 20260127025639 body, search_path as set
--                                       by 20260601002502 (private, public, pg_temp)
-- The anon/PUBLIC EXECUTE revocation is intentionally KEPT: no supported caller
-- uses anon, and restoring it re-opens cross-workspace invoice reads. To restore
-- the exact previous ACL as well, run the commented statements at the end only
-- with explicit release-authority approval.
-- Not a migration: apply manually only with release-authority approval.
begin;
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
set search_path = public
as $$
declare
  v_total_count bigint;
  v_escaped_query text;
begin
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

CREATE OR REPLACE FUNCTION public.get_invoice_totals_by_date_range(
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
 SET search_path = private, public, pg_temp
AS $function$
DECLARE
  _start_date TIMESTAMPTZ;
  _end_date TIMESTAMPTZ;
  _day_count INT;
  _interval_type TEXT;
BEGIN
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
          WHEN 'week' THEN trunc_to_week_start(gs::TIMESTAMPTZ, week_start_day)
          WHEN 'month' THEN date_trunc('month', gs)::DATE
        END AS period_start
      FROM generate_series(
        CASE _interval_type
          WHEN 'day' THEN _start_date::TIMESTAMPTZ
          WHEN 'week' THEN trunc_to_week_start(_start_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ
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
      FROM finance_invoices fi
      LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
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
      LEFT JOIN users u ON rc.creator_id = u.id
      LEFT JOIN user_private_details upd ON u.id = upd.user_id
      LEFT JOIN workspace_users wu ON rc.creator_id = wu.id
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
          WHEN 'week' THEN trunc_to_week_start(fi.created_at, week_start_day)
          WHEN 'month' THEN date_trunc('month', fi.created_at)::DATE
        END AS period_start,
        COALESCE(fi.platform_creator_id, wulu.platform_user_id, fi.creator_id) AS creator_id,
        SUM(fi.price)::NUMERIC AS total_amount,
        COUNT(*)::BIGINT AS invoice_count
      FROM finance_invoices fi
      LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
      LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
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
          WHEN 'week' THEN trunc_to_week_start(gs::TIMESTAMPTZ, week_start_day)
          WHEN 'month' THEN date_trunc('month', gs)::DATE
        END AS period_start
      FROM generate_series(
        CASE _interval_type
          WHEN 'day' THEN _start_date::TIMESTAMPTZ
          WHEN 'week' THEN trunc_to_week_start(_start_date::TIMESTAMPTZ, week_start_day)::TIMESTAMPTZ
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
      FROM workspace_wallets ww
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
          WHEN 'week' THEN trunc_to_week_start(fi.created_at, week_start_day)
          WHEN 'month' THEN date_trunc('month', fi.created_at)::DATE
        END AS period_start,
        wt.wallet_id,
        SUM(fi.price)::NUMERIC AS total_amount,
        COUNT(*)::BIGINT AS invoice_count
      FROM finance_invoices fi
      -- Use LEFT JOIN to consistently include invoices even if they lack linked transactions/wallets
      LEFT JOIN wallet_transactions wt ON fi.transaction_id = wt.id
      LEFT JOIN workspace_wallets ww ON wt.wallet_id = ww.id
      LEFT JOIN workspace_user_linked_users wulu ON wulu.virtual_user_id = fi.creator_id
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

grant execute on function public.search_finance_invoices(uuid, text, timestamptz, timestamptz, uuid[], uuid[], integer, integer)
  to authenticated, service_role;
grant execute on function public.get_invoice_totals_by_date_range(uuid, timestamptz, timestamptz, uuid[], uuid[], boolean, integer, text)
  to authenticated, service_role;

-- Wallet and transaction read RPCs: restore the previous actor guard and
-- search_path on the live definitions (anon stays revoked).
do $$
declare
  v_item record;
  v_definition text;
  v_new_guard constant text :=
    'IF COALESCE\(auth\.role\(\), ''''\) <> ''service_role''\s+'
    || 'AND \(auth\.uid\(\) IS NULL OR p_user_id IS DISTINCT FROM auth\.uid\(\)\) THEN\s+'
    || 'RAISE EXCEPTION ''Permission denied'' USING ERRCODE = ''42501'';\s+END IF;';
begin
  for v_item in
    select *
    from (
      values
        ('public.get_wallet_permission_context(uuid,uuid)', 'p_ws_id', 'public, extensions, pg_temp'),
        ('public.get_wallet_income_sum(uuid,uuid,boolean)', 'p_ws_id', 'private, public, pg_temp'),
        ('public.get_wallet_income_count(uuid,uuid,boolean)', 'p_ws_id', 'private, public, pg_temp'),
        ('public.get_wallet_expense_sum(uuid,uuid,boolean)', 'p_ws_id', 'private, public, pg_temp'),
        ('public.get_wallet_expense_count(uuid,uuid,boolean)', 'p_ws_id', 'private, public, pg_temp'),
        ('public.get_workspace_wallets_income(uuid,uuid,timestamptz,timestamptz,boolean)', 'ws_id', 'private, public, pg_temp'),
        ('public.get_workspace_wallets_expense(uuid,uuid,timestamptz,timestamptz,boolean)', 'ws_id', 'private, public, pg_temp'),
        ('public.get_transactions_by_period(uuid,text,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz,timestamptz,integer,text)', 'p_ws_id', 'private, public, pg_temp'),
        ('public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz,text,text,integer,integer,timestamptz,timestamptz,boolean,timestamptz)', 'p_ws_id', 'private, public, pg_temp')
    ) as t(signature, ws_param, search_path)
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_item.signature::regprocedure);

    if pg_catalog.regexp_count(v_definition, v_new_guard) <> 1 then
      raise exception 'Unexpected actor guard in %', v_item.signature;
    end if;

    execute pg_catalog.regexp_replace(
      v_definition,
      v_new_guard,
      'IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    IF NOT public.has_workspace_permission(' || v_item.ws_param
        || ', auth.uid(), ''manage_workspace_roles'') THEN
      RAISE EXCEPTION ''Permission denied'';
    END IF;
  END IF;'
    );
    execute format(
      'alter function %s set search_path = %s',
      v_item.signature,
      v_item.search_path
    );
    execute format(
      'grant execute on function %s to authenticated, service_role',
      v_item.signature
    );
  end loop;
end;
$$;

-- Legacy overloads: restore their previous search_path and authenticated
-- EXECUTE (anon stays revoked).
do $$
declare
  v_target text;
begin
  foreach v_target in array array[
    'public.get_wallet_income_sum(uuid,uuid)',
    'public.get_wallet_income_count(uuid,uuid)',
    'public.get_wallet_expense_sum(uuid,uuid)',
    'public.get_wallet_expense_count(uuid,uuid)',
    'public.get_workspace_wallets_income(uuid,timestamptz,timestamptz,boolean)',
    'public.get_workspace_wallets_expense(uuid,timestamptz,timestamptz,boolean)'
  ]
  loop
    execute format(
      'alter function %s set search_path = private, public, pg_temp',
      v_target
    );
    execute format(
      'grant execute on function %s to authenticated, service_role',
      v_target
    );
  end loop;
end;
$$;

-- Exact previous ACL for the wallet RPCs (re-opens anon access; approval
-- required): run `grant execute on function <signature> to public, anon;` for
-- each signature listed above.

-- Exact previous ACL (re-opens anon access; approval required):
-- grant execute on function public.search_finance_invoices(uuid, text, timestamptz, timestamptz, uuid[], uuid[], integer, integer)
--   to public;
-- grant execute on function public.get_invoice_totals_by_date_range(uuid, timestamptz, timestamptz, uuid[], uuid[], boolean, integer, text)
--   to public, anon;

commit;
