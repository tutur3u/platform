create schema if not exists private;

grant usage on schema private to service_role;

create or replace function private.get_income_expense_chart_summary(
  _ws_id uuid,
  _actor_id uuid,
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
declare
  v_interval text;
  v_start_date date;
  v_end_date date;
  v_start_at timestamp with time zone;
  v_end_at timestamp with time zone;
  v_can_view_amount boolean;
begin
  v_interval := lower(coalesce(_interval, 'daily'));

  if v_interval not in ('daily', 'monthly') then
    raise exception 'Invalid chart interval: %', _interval;
  end if;

  if _actor_id is null or not public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_finance_stats'
  ) then
    raise exception 'Permission denied';
  end if;

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );

  if v_interval = 'daily' then
    v_end_date := coalesce(_end_date::date, current_date);
    v_start_date := coalesce(_start_date::date, v_end_date - 13);
    v_start_at := v_start_date::timestamp with time zone;
    v_end_at := (v_end_date + 1)::timestamp with time zone;

    return (
      with period_series as (
        select generate_series(
          v_start_date,
          v_end_date,
          interval '1 day'
        )::date as period_date
      ),
      opening_balance as (
        select coalesce(sum(wt.amount), 0)::numeric as amount
        from public.wallet_transactions wt
        join public.workspace_wallets ww
          on ww.id = wt.wallet_id
        where ww.ws_id = _ws_id
          and wt.taken_at < v_start_at
          and (
            (not include_confidential and not wt.is_amount_confidential)
            or (
              include_confidential
              and (not wt.is_amount_confidential or v_can_view_amount)
            )
          )
      ),
      closing_balance as (
        select coalesce(sum(wt.amount), 0)::numeric as amount
        from public.wallet_transactions wt
        join public.workspace_wallets ww
          on ww.id = wt.wallet_id
        where ww.ws_id = _ws_id
          and wt.taken_at < v_end_at
          and (
            (not include_confidential and not wt.is_amount_confidential)
            or (
              include_confidential
              and (not wt.is_amount_confidential or v_can_view_amount)
            )
          )
      ),
      period_totals as (
        select
          wt.taken_at::date as period_date,
          coalesce(sum(case when wt.amount > 0 then wt.amount else 0 end), 0)::numeric as total_income,
          abs(coalesce(sum(case when wt.amount < 0 then wt.amount else 0 end), 0))::numeric as total_expense
        from public.wallet_transactions wt
        join public.workspace_wallets ww
          on ww.id = wt.wallet_id
        where ww.ws_id = _ws_id
          and wt.taken_at >= v_start_at
          and wt.taken_at < v_end_at
          and (
            (not include_confidential and not wt.is_amount_confidential)
            or (
              include_confidential
              and (not wt.is_amount_confidential or v_can_view_amount)
            )
          )
        group by wt.taken_at::date
      ),
      series as (
        select
          ps.period_date,
          coalesce(pt.total_income, 0)::numeric as total_income,
          coalesce(pt.total_expense, 0)::numeric as total_expense
        from period_series ps
        left join period_totals pt
          on pt.period_date = ps.period_date
        order by ps.period_date
      ),
      summary as (
        select
          coalesce(sum(total_income), 0)::numeric as total_income,
          coalesce(sum(total_expense), 0)::numeric as total_expense,
          coalesce(sum(total_income - total_expense), 0)::numeric as net_total,
          coalesce(avg(total_income), 0)::numeric as average_income,
          coalesce(avg(total_expense), 0)::numeric as average_expense
        from series
      )
      select jsonb_build_object(
        'opening_balance', (select amount from opening_balance),
        'closing_balance', (select amount from closing_balance),
        'total_income', (select total_income from summary),
        'total_expense', (select total_expense from summary),
        'net_total', (select net_total from summary),
        'average_income', (select average_income from summary),
        'average_expense', (select average_expense from summary),
        'data', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'period', s.period_date,
                'total_income', s.total_income,
                'total_expense', s.total_expense
              )
              order by s.period_date
            )
            from series s
          ),
          '[]'::jsonb
        )
      )
    );
  end if;

  v_end_date := coalesce(
    date_trunc('month', _end_date)::date,
    date_trunc('month', current_date)::date
  );
  v_start_date := coalesce(
    date_trunc('month', _start_date)::date,
    (v_end_date - interval '11 months')::date
  );
  v_start_at := v_start_date::timestamp with time zone;
  v_end_at := (v_end_date + interval '1 month')::timestamp with time zone;

  return (
    with period_series as (
      select generate_series(
        v_start_date,
        v_end_date,
        interval '1 month'
      )::date as period_date
    ),
    opening_balance as (
      select coalesce(sum(wt.amount), 0)::numeric as amount
      from public.wallet_transactions wt
      join public.workspace_wallets ww
        on ww.id = wt.wallet_id
      where ww.ws_id = _ws_id
        and wt.taken_at < v_start_at
        and (
          (not include_confidential and not wt.is_amount_confidential)
          or (
            include_confidential
            and (not wt.is_amount_confidential or v_can_view_amount)
          )
        )
    ),
    closing_balance as (
      select coalesce(sum(wt.amount), 0)::numeric as amount
      from public.wallet_transactions wt
      join public.workspace_wallets ww
        on ww.id = wt.wallet_id
      where ww.ws_id = _ws_id
        and wt.taken_at < v_end_at
        and (
          (not include_confidential and not wt.is_amount_confidential)
          or (
            include_confidential
            and (not wt.is_amount_confidential or v_can_view_amount)
          )
        )
    ),
    period_totals as (
      select
        date_trunc('month', wt.taken_at)::date as period_date,
        coalesce(sum(case when wt.amount > 0 then wt.amount else 0 end), 0)::numeric as total_income,
        abs(coalesce(sum(case when wt.amount < 0 then wt.amount else 0 end), 0))::numeric as total_expense
      from public.wallet_transactions wt
      join public.workspace_wallets ww
        on ww.id = wt.wallet_id
      where ww.ws_id = _ws_id
        and wt.taken_at >= v_start_at
        and wt.taken_at < v_end_at
        and (
          (not include_confidential and not wt.is_amount_confidential)
          or (
            include_confidential
            and (not wt.is_amount_confidential or v_can_view_amount)
          )
        )
      group by date_trunc('month', wt.taken_at)::date
    ),
    series as (
      select
        ps.period_date,
        coalesce(pt.total_income, 0)::numeric as total_income,
        coalesce(pt.total_expense, 0)::numeric as total_expense
      from period_series ps
      left join period_totals pt
        on pt.period_date = ps.period_date
      order by ps.period_date
    ),
    summary as (
      select
        coalesce(sum(total_income), 0)::numeric as total_income,
        coalesce(sum(total_expense), 0)::numeric as total_expense,
        coalesce(sum(total_income - total_expense), 0)::numeric as net_total,
        coalesce(avg(total_income), 0)::numeric as average_income,
        coalesce(avg(total_expense), 0)::numeric as average_expense
      from series
    )
    select jsonb_build_object(
      'opening_balance', (select amount from opening_balance),
      'closing_balance', (select amount from closing_balance),
      'total_income', (select total_income from summary),
      'total_expense', (select total_expense from summary),
      'net_total', (select net_total from summary),
      'average_income', (select average_income from summary),
      'average_expense', (select average_expense from summary),
      'data', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'period', s.period_date,
              'total_income', s.total_income,
              'total_expense', s.total_expense
            )
            order by s.period_date
          )
          from series s
        ),
        '[]'::jsonb
      )
    )
  );
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

create or replace function private.get_balance_trend(
  _ws_id uuid,
  _actor_id uuid,
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
declare
  v_start_date date;
  v_end_date date;
  v_start_at timestamp with time zone;
  v_end_at timestamp with time zone;
  v_max_points integer;
  v_can_view_amount boolean;
begin
  if _actor_id is null or not public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_finance_stats'
  ) then
    raise exception 'Permission denied';
  end if;

  v_end_date := coalesce(_end_date::date, current_date);
  v_start_date := coalesce(_start_date::date, v_end_date - 29);
  v_start_at := v_start_date::timestamp with time zone;
  v_end_at := (v_end_date + 1)::timestamp with time zone;
  v_max_points := least(greatest(coalesce(_max_points, 60), 1), 366);
  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );

  return query
  with day_series as (
    select generate_series(
      v_start_date,
      v_end_date,
      interval '1 day'
    )::date as balance_date
  ),
  opening_balance as (
    select coalesce(sum(wt.amount), 0)::numeric as amount
    from public.wallet_transactions wt
    join public.workspace_wallets ww
      on ww.id = wt.wallet_id
    where ww.ws_id = _ws_id
      and wt.taken_at < v_start_at
      and (
        (not include_confidential and not wt.is_amount_confidential)
        or (
          include_confidential
          and (not wt.is_amount_confidential or v_can_view_amount)
        )
      )
  ),
  daily_deltas as (
    select
      wt.taken_at::date as balance_date,
      coalesce(sum(wt.amount), 0)::numeric as amount
    from public.wallet_transactions wt
    join public.workspace_wallets ww
      on ww.id = wt.wallet_id
    where ww.ws_id = _ws_id
      and wt.taken_at >= v_start_at
      and wt.taken_at < v_end_at
      and (
        (not include_confidential and not wt.is_amount_confidential)
        or (
          include_confidential
          and (not wt.is_amount_confidential or v_can_view_amount)
        )
      )
    group by wt.taken_at::date
  ),
  running_balances as (
    select
      ds.balance_date,
      (
        ob.amount
        + sum(coalesce(dd.amount, 0)) over (order by ds.balance_date)
      )::double precision as balance,
      row_number() over (order by ds.balance_date) as row_number,
      count(*) over () as total_count
    from day_series ds
    cross join opening_balance ob
    left join daily_deltas dd
      on dd.balance_date = ds.balance_date
  )
  select
    rb.balance_date as date,
    rb.balance
  from running_balances rb
  where rb.total_count <= v_max_points
    or rb.row_number = rb.total_count
    or (rb.row_number - 1) % ceil(
      rb.total_count::numeric / v_max_points
    )::integer = 0
  order by rb.balance_date;
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

drop function if exists public.get_category_breakdown(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  boolean,
  text
);

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
set search_path = public, pg_temp
as $$
declare
  can_view_amount boolean;
  v_start_ts timestamp with time zone;
  v_end_ts timestamp with time zone;
  v_interval text;
  v_latest_ts timestamp with time zone;
begin
  if _actor_id is null or not public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_finance_stats'
  ) then
    raise exception 'Permission denied';
  end if;

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
    select max(wt.taken_at)
    into v_latest_ts
    from public.wallet_transactions wt
    join public.workspace_wallets ww
      on wt.wallet_id = ww.id
    where ww.ws_id = _ws_id
      and (_wallet_ids is null or wt.wallet_id = any(_wallet_ids))
      and (
        (_transaction_type = 'expense' and wt.amount < 0)
        or (_transaction_type = 'income' and wt.amount > 0)
        or (_transaction_type = 'all')
      )
      and (
        (not include_confidential and not wt.is_amount_confidential)
        or (
          include_confidential
          and (not wt.is_amount_confidential or can_view_amount)
        )
      );

    v_end_ts := coalesce(
      v_latest_ts,
      (date_trunc('day', now() at time zone _timezone) + interval '1 day - 1 microsecond') at time zone _timezone
    );
  else
    v_end_ts := (date_trunc('day', now() at time zone _timezone) + interval '1 day - 1 microsecond') at time zone _timezone;
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
    (date_trunc(v_interval, wt.taken_at at time zone _timezone))::date as period,
    tc.id as category_id,
    coalesce(tc.name, 'Uncategorized')::text as category_name,
    tc.icon::text as category_icon,
    tc.color::text as category_color,
    coalesce(sum(abs(wt.amount)), 0)::numeric as total
  from public.wallet_transactions wt
  join public.workspace_wallets ww
    on wt.wallet_id = ww.id
  left join public.transaction_categories tc
    on wt.category_id = tc.id
  where ww.ws_id = _ws_id
    and (_wallet_ids is null or wt.wallet_id = any(_wallet_ids))
    and (
      (_transaction_type = 'expense' and wt.amount < 0)
      or (_transaction_type = 'income' and wt.amount > 0)
      or (_transaction_type = 'all')
    )
    and wt.taken_at >= v_start_ts
    and wt.taken_at <= v_end_ts
    and (
      (not include_confidential and not wt.is_amount_confidential)
      or (
        include_confidential
        and (not wt.is_amount_confidential or can_view_amount)
      )
    )
  group by date_trunc(v_interval, wt.taken_at at time zone _timezone), tc.id, tc.name, tc.icon, tc.color
  order by period, total desc;
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

revoke all on function private.get_income_expense_chart_summary(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text
) from public, anon, authenticated;
grant execute on function private.get_income_expense_chart_summary(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text
) to service_role;

revoke all on function private.get_balance_trend(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) from public, anon, authenticated;
grant execute on function private.get_balance_trend(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) to service_role;

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

revoke all on function public.get_income_expense_chart_summary(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text
) from public, anon;
grant execute on function public.get_income_expense_chart_summary(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text
) to authenticated;

revoke all on function public.get_balance_trend(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) from public, anon;
grant execute on function public.get_balance_trend(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) to authenticated;

revoke all on function public.get_category_breakdown(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  boolean,
  text,
  uuid[]
) from public, anon;
grant execute on function public.get_category_breakdown(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  boolean,
  text,
  uuid[]
) to authenticated;

comment on function private.get_income_expense_chart_summary(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text
) is
  'Server-owned finance analytics helper that returns income/expense chart data, balances, and totals for one workspace and actor.';

comment on function private.get_balance_trend(
  uuid,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) is
  'Server-owned finance analytics helper that returns sampled wallet balance trends for one workspace and actor.';

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
  'Server-owned finance analytics helper that returns category breakdown chart data for one workspace and actor.';

comment on function public.get_income_expense_chart_summary(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text
) is
  'Compatibility wrapper for private.get_income_expense_chart_summary using auth.uid().';

comment on function public.get_balance_trend(
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  integer
) is
  'Compatibility wrapper for private.get_balance_trend using auth.uid().';

comment on function public.get_category_breakdown(
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
  'Compatibility wrapper for private.get_category_breakdown using auth.uid().';

notify pgrst, 'reload schema';
