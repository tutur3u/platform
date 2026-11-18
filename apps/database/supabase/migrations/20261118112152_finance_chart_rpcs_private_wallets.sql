-- The finance chart RPCs joined public.workspace_wallets after
-- 20260601002502 moved that table to private, so both raised 42P01 and the
-- daily and monthly charts failed. They are re-created against
-- private.workspace_wallets with every reference qualified and a pinned
-- search_path. SECURITY DEFINER, the caller permission guard and EXECUTE
-- grants are unchanged; CREATE OR REPLACE keeps the existing ACLs.
--
-- get_transaction_categories_with_amount_by_workspace is called only by
-- service-role server code, so client roles lose EXECUTE and its
-- search_path is pinned.

set local lock_timeout = '5s';

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
set search_path = pg_catalog, pg_temp
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
    inner join private.workspace_wallets ww
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
set search_path = pg_catalog, pg_temp
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
    inner join private.workspace_wallets ww
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

-- CREATE OR REPLACE keeps existing grants; restate the execute boundary the
-- chart RPCs had before this migration so it is explicit in this file.
revoke all on function public.get_daily_income_expense_range(
  uuid, timestamp with time zone, timestamp with time zone, boolean
) from public, anon, authenticated;
grant execute on function public.get_daily_income_expense_range(
  uuid, timestamp with time zone, timestamp with time zone, boolean
) to service_role;
-- tuturuuu: reviewed(function-grant): public.get_daily_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean) review=FIN-WALLET-RPC-01
grant execute on function public.get_daily_income_expense_range(
  uuid, timestamp with time zone, timestamp with time zone, boolean
) to authenticated;

revoke all on function public.get_monthly_income_expense_range(
  uuid, timestamp with time zone, timestamp with time zone, boolean
) from public, anon, authenticated;
grant execute on function public.get_monthly_income_expense_range(
  uuid, timestamp with time zone, timestamp with time zone, boolean
) to service_role;
-- tuturuuu: reviewed(function-grant): public.get_monthly_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean) review=FIN-WALLET-RPC-01
grant execute on function public.get_monthly_income_expense_range(
  uuid, timestamp with time zone, timestamp with time zone, boolean
) to authenticated;

-- tuturuuu: reviewed(alter-routine-review): FIN-WALLET-RPC-01 F5 pins search_path; body already fully qualified
alter function public.get_transaction_categories_with_amount_by_workspace(uuid)
  set search_path = pg_catalog, pg_temp;

revoke execute on function public.get_transaction_categories_with_amount_by_workspace(uuid)
  from public, anon, authenticated;
grant execute on function public.get_transaction_categories_with_amount_by_workspace(uuid)
  to service_role;
