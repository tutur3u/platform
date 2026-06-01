create or replace function private.assert_finance_chart_date_range(
  _start_date timestamp with time zone,
  _end_date timestamp with time zone,
  _max_days integer
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_start_date date;
  v_end_date date;
begin
  if _start_date is null then
    return;
  end if;

  v_start_date := _start_date::date;
  v_end_date := coalesce(_end_date::date, current_date);

  if v_start_date > v_end_date then
    raise exception 'Start date must be before or equal to end date'
      using errcode = '22007';
  end if;

  if (v_end_date - v_start_date + 1) > _max_days then
    raise exception 'Finance analytics date range cannot exceed % days', _max_days
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.assert_finance_chart_date_range(
  timestamp with time zone,
  timestamp with time zone,
  integer
) from public, anon, authenticated;

grant execute on function private.assert_finance_chart_date_range(
  timestamp with time zone,
  timestamp with time zone,
  integer
) to service_role;

create or replace function public.get_daily_income_expense_range(
  _ws_id uuid,
  _start_date timestamp with time zone default null,
  _end_date timestamp with time zone default null,
  include_confidential boolean default true
)
returns table (
  day date,
  total_income numeric,
  total_expense numeric
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  can_view_amount boolean;
  v_start_date date;
  v_end_date date;
begin
  if auth.uid() is null or not public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_finance_stats'
  ) then
    raise exception 'Permission denied';
  end if;

  perform private.assert_finance_chart_date_range(_start_date, _end_date, 366);

  can_view_amount := public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_confidential_amount'
  );

  v_end_date := coalesce(_end_date::date, current_date);
  v_start_date := coalesce(_start_date::date, v_end_date - interval '13 days');

  return query
  with date_series as (
    select generate_series(v_start_date, v_end_date, '1 day'::interval)::date as day
  ),
  daily_transactions as (
    select
      date_trunc('day', wt.taken_at::timestamp)::date as day,
      sum(case when wt.amount > 0 then wt.amount else 0 end)::numeric as income,
      sum(case when wt.amount < 0 then wt.amount else 0 end)::numeric as expense
    from public.wallet_transactions wt
    inner join public.workspace_wallets ww
      on wt.wallet_id = ww.id
    where wt.taken_at::date >= v_start_date
      and wt.taken_at::date <= v_end_date
      and ww.ws_id = _ws_id
      and (
        (not include_confidential and not wt.is_amount_confidential)
        or (
          include_confidential
          and (not wt.is_amount_confidential or can_view_amount)
        )
      )
    group by date_trunc('day', wt.taken_at::timestamp)::date
  )
  select
    ds.day,
    coalesce(dt.income, 0)::numeric as total_income,
    abs(coalesce(dt.expense, 0))::numeric as total_expense
  from date_series ds
  left join daily_transactions dt
    on ds.day = dt.day
  order by ds.day;
end;
$$;

create or replace function public.get_monthly_income_expense_range(
  _ws_id uuid,
  _start_date timestamp with time zone default null,
  _end_date timestamp with time zone default null,
  include_confidential boolean default true
)
returns table (
  month date,
  total_income numeric,
  total_expense numeric
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  can_view_amount boolean;
  v_start_date date;
  v_end_date date;
begin
  if auth.uid() is null or not public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_finance_stats'
  ) then
    raise exception 'Permission denied';
  end if;

  perform private.assert_finance_chart_date_range(_start_date, _end_date, 3660);

  can_view_amount := public.has_workspace_permission(
    _ws_id,
    auth.uid(),
    'view_confidential_amount'
  );

  v_end_date := coalesce(
    date_trunc('month', _end_date)::date,
    date_trunc('month', current_date)::date
  );
  v_start_date := coalesce(
    date_trunc('month', _start_date)::date,
    v_end_date - interval '11 months'
  );

  return query
  with month_series as (
    select generate_series(v_start_date, v_end_date, '1 month'::interval)::date as month
  ),
  monthly_transactions as (
    select
      date_trunc('month', wt.taken_at::timestamp)::date as month,
      sum(case when wt.amount > 0 then wt.amount else 0 end)::numeric as income,
      sum(case when wt.amount < 0 then wt.amount else 0 end)::numeric as expense
    from public.wallet_transactions wt
    inner join public.workspace_wallets ww
      on wt.wallet_id = ww.id
    where date_trunc('month', wt.taken_at::timestamp)::date >= v_start_date
      and date_trunc('month', wt.taken_at::timestamp)::date <= v_end_date
      and ww.ws_id = _ws_id
      and (
        (not include_confidential and not wt.is_amount_confidential)
        or (
          include_confidential
          and (not wt.is_amount_confidential or can_view_amount)
        )
      )
    group by date_trunc('month', wt.taken_at::timestamp)::date
  )
  select
    ms.month,
    coalesce(mt.income, 0)::numeric as total_income,
    abs(coalesce(mt.expense, 0))::numeric as total_expense
  from month_series ms
  left join monthly_transactions mt
    on ms.month = mt.month
  order by ms.month;
end;
$$;

create or replace function public.get_income_expense_chart_summary(
  _ws_id uuid,
  _start_date timestamp with time zone default null,
  _end_date timestamp with time zone default null,
  include_confidential boolean default true,
  _interval text default 'daily'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  perform private.assert_finance_chart_date_range(
    _start_date,
    _end_date,
    case lower(coalesce(_interval, 'daily'))
      when 'daily' then 366
      else 3660
    end
  );

  return private.get_income_expense_chart_summary(
    _ws_id,
    auth.uid(),
    _start_date,
    _end_date,
    include_confidential,
    _interval
  );
end;
$$;

create or replace function public.get_balance_trend(
  _ws_id uuid,
  _start_date timestamp with time zone default null,
  _end_date timestamp with time zone default null,
  include_confidential boolean default true,
  _max_points integer default 60
)
returns table(
  date date,
  balance double precision
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  perform private.assert_finance_chart_date_range(_start_date, _end_date, 366);

  return query
  select *
  from private.get_balance_trend(
    _ws_id,
    auth.uid(),
    _start_date,
    _end_date,
    include_confidential,
    _max_points
  );
end;
$$;

create or replace function public.get_category_breakdown(
  _ws_id uuid,
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
set search_path = public, pg_temp
as $$
begin
  perform private.assert_finance_chart_date_range(
    _start_date,
    _end_date,
    case lower(coalesce(_interval, 'monthly'))
      when 'daily' then 366
      else 3660
    end
  );

  return query
  select *
  from private.get_category_breakdown(
    _ws_id,
    auth.uid(),
    _start_date,
    _end_date,
    include_confidential,
    _transaction_type,
    _interval,
    _anchor_to_latest,
    _timezone,
    _wallet_ids
  );
end;
$$;

revoke all on function public.get_daily_income_expense_range(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean
) from public, anon;

grant execute on function public.get_daily_income_expense_range(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean
) to authenticated;

revoke all on function public.get_monthly_income_expense_range(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean
) from public, anon;

grant execute on function public.get_monthly_income_expense_range(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean
) to authenticated;

comment on function private.assert_finance_chart_date_range(
  timestamp with time zone,
  timestamp with time zone,
  integer
) is
  'Shared guard for finance analytics RPCs that generate date series or scan caller-selected date windows.';
