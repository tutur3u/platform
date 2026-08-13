-- Category breakdown is embedded in both the finance analytics page and the
-- ordinary transactions surface. The route authorizes view_transactions, but
-- the private app-session RPC historically required view_finance_stats only,
-- turning a valid limited role into a 500 "Permission denied" response.

create or replace function private.get_category_breakdown(
  _ws_id uuid,
  _actor_id uuid,
  _start_date timestamp with time zone default null,
  _end_date timestamp with time zone default null,
  include_confidential boolean default true,
  _transaction_type text default 'expense',
  _interval text default 'monthly',
  _anchor_to_latest boolean default false,
  _timezone text default 'UTC',
  _wallet_ids uuid[] default null
)
returns table(
  period date,
  category_id uuid,
  category_name text,
  category_icon text,
  category_color text,
  total numeric
)
language plpgsql
security definer
stable
set search_path = private, public, pg_temp
as $$
declare
  can_view_amount boolean;
  v_start_ts timestamp with time zone;
  v_end_ts timestamp with time zone;
  v_interval text;
  v_latest_ts timestamp with time zone;
begin
  if _actor_id is null or not (
    public.has_workspace_permission(
      _ws_id,
      _actor_id,
      'view_finance_stats'
    )
    or public.has_workspace_permission(
      _ws_id,
      _actor_id,
      'view_transactions'
    )
  ) then
    raise exception 'Permission denied';
  end if;

  perform private.assert_finance_chart_date_range(
    _start_date,
    _end_date,
    case pg_catalog.lower(coalesce(_interval, 'monthly'))
      when 'daily' then 366
      else 3660
    end
  );

  can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );

  v_interval := case _interval
    when 'daily' then 'day'
    when 'weekly' then 'week'
    when 'monthly' then 'month'
    when 'yearly' then 'year'
    else 'month'
  end;

  if _end_date is not null then
    v_end_ts := _end_date;
  elsif _anchor_to_latest then
    select pg_catalog.max(txn.taken_at)
    into v_latest_ts
    from public.wallet_transactions txn
    join private.workspace_wallets wallet
      on txn.wallet_id = wallet.id
    where wallet.ws_id = _ws_id
      and (_wallet_ids is null or txn.wallet_id = any(_wallet_ids))
      and (
        (_transaction_type = 'expense' and txn.amount < 0)
        or (_transaction_type = 'income' and txn.amount > 0)
        or _transaction_type = 'all'
      )
      and (
        (not include_confidential and not txn.is_amount_confidential)
        or (
          include_confidential
          and (not txn.is_amount_confidential or can_view_amount)
        )
      );

    v_end_ts := coalesce(
      v_latest_ts,
      (
        pg_catalog.date_trunc('day', pg_catalog.now() at time zone _timezone)
        + interval '1 day - 1 microsecond'
      ) at time zone _timezone
    );
  else
    v_end_ts := (
      pg_catalog.date_trunc('day', pg_catalog.now() at time zone _timezone)
      + interval '1 day - 1 microsecond'
    ) at time zone _timezone;
  end if;

  if _start_date is not null then
    v_start_ts := _start_date;
  else
    v_start_ts := case v_interval
      when 'day' then v_end_ts - interval '30 days'
      when 'week' then v_end_ts - interval '12 weeks'
      when 'month' then v_end_ts - interval '11 months'
      when 'year' then v_end_ts - interval '4 years'
      else v_end_ts - interval '11 months'
    end;
  end if;

  return query
  select
    (
      pg_catalog.date_trunc(
        v_interval,
        txn.taken_at at time zone _timezone
      )
    )::date as period,
    category.id as category_id,
    coalesce(category.name, 'Uncategorized')::text as category_name,
    category.icon::text as category_icon,
    category.color::text as category_color,
    coalesce(
      pg_catalog.sum(pg_catalog.abs(txn.amount)),
      0
    )::numeric as total
  from public.wallet_transactions txn
  join private.workspace_wallets wallet on txn.wallet_id = wallet.id
  left join public.transaction_categories category
    on txn.category_id = category.id
  where wallet.ws_id = _ws_id
    and (_wallet_ids is null or txn.wallet_id = any(_wallet_ids))
    and (
      (_transaction_type = 'expense' and txn.amount < 0)
      or (_transaction_type = 'income' and txn.amount > 0)
      or _transaction_type = 'all'
    )
    and txn.taken_at >= v_start_ts
    and txn.taken_at <= v_end_ts
    and (
      (not include_confidential and not txn.is_amount_confidential)
      or (
        include_confidential
        and (not txn.is_amount_confidential or can_view_amount)
      )
    )
  group by
    pg_catalog.date_trunc(
      v_interval,
      txn.taken_at at time zone _timezone
    ),
    category.id,
    category.name,
    category.icon,
    category.color
  order by period, total desc;
end;
$$;

revoke all on function private.get_category_breakdown(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  boolean,
  text,
  uuid[]
) from public, anon, authenticated;

grant execute on function private.get_category_breakdown(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  boolean,
  text,
  uuid[]
) to service_role;

comment on function private.get_category_breakdown(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  boolean,
  text,
  uuid[]
) is
  'Server-owned category breakdown for finance-stat or transaction viewers. Confidential amounts remain permission-gated and caller-controlled date ranges are bounded.';

notify pgrst, 'reload schema';
