create schema if not exists private;

drop function if exists private.get_wallet_interest_summary(uuid, uuid, uuid);
drop function if exists private.wallet_interest_calculation_result(
  uuid,
  uuid,
  date,
  date,
  date,
  date,
  numeric
);
drop function if exists private.wallet_interest_project_rows(numeric, numeric, date, integer);
drop function if exists private.wallet_interest_next_business_day(date);
drop function if exists private.wallet_interest_is_business_day(date);

create or replace function private.wallet_interest_is_business_day(_date date)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select extract(dow from _date) not in (0, 6)
    and not exists (
      select 1
      from public.vietnamese_holidays vh
      where vh.date = _date
    );
$$;

create or replace function private.wallet_interest_next_business_day(_date date)
returns date
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_next date := _date + 1;
begin
  while not private.wallet_interest_is_business_day(v_next) loop
    v_next := v_next + 1;
  end loop;

  return v_next;
end;
$$;

create or replace function private.wallet_interest_project_rows(
  _current_balance numeric,
  _current_rate numeric,
  _start_date date,
  _days integer
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_current_date date := _start_date;
  v_daily_interest numeric;
  v_index integer;
  v_is_business_day boolean;
  v_projected_balance numeric := coalesce(_current_balance, 0);
  v_projections jsonb := '[]'::jsonb;
  v_total_interest numeric := 0;
begin
  for v_index in 1..greatest(coalesce(_days, 0), 0) loop
    v_is_business_day := private.wallet_interest_is_business_day(v_current_date);
    v_daily_interest := 0;

    if v_is_business_day
      and v_projected_balance > 0
      and coalesce(_current_rate, 0) > 0
    then
      v_daily_interest := floor(v_projected_balance * ((_current_rate / 100) / 365));
      v_projected_balance := v_projected_balance + v_daily_interest;
    end if;

    v_total_interest := v_total_interest + v_daily_interest;
    v_projections := v_projections || jsonb_build_array(jsonb_build_object(
      'date', to_char(v_current_date, 'YYYY-MM-DD'),
      'projectedBalance', v_projected_balance,
      'projectedDailyInterest', v_daily_interest,
      'projectedCumulativeInterest', v_total_interest,
      'isBusinessDay', v_is_business_day
    ));

    v_current_date := v_current_date + 1;
  end loop;

  return v_projections;
end;
$$;

create or replace function private.wallet_interest_calculation_result(
  _wallet_id uuid,
  _config_id uuid,
  _from_date date,
  _to_date date,
  _transaction_from_date date,
  _transaction_to_date date,
  _initial_balance numeric default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_balance numeric := coalesce(_initial_balance, 0);
  v_business_days_count integer := 0;
  v_current_date date := _from_date;
  v_daily_interest numeric;
  v_deposit jsonb;
  v_deposits jsonb := '[]'::jsonb;
  v_interest_earning_balance numeric;
  v_interest_start_date date;
  v_is_business_day boolean;
  v_oldest_amount numeric;
  v_rate numeric;
  v_remaining numeric;
  v_total_interest numeric := 0;
  v_transaction record;
begin
  if _from_date is null or _to_date is null or _from_date > _to_date then
    return jsonb_build_object(
      'totalInterest', 0,
      'businessDaysCount', 0,
      'finalBalance', v_balance
    );
  end if;

  if v_balance > 0 then
    v_deposits := v_deposits || jsonb_build_array(jsonb_build_object(
      'amount', v_balance,
      'interestStartDate', '1970-01-01'
    ));
  end if;

  while v_current_date <= _to_date loop
    for v_transaction in
      select
        wt.amount::numeric as amount,
        wt.created_at::date as transaction_date
      from public.wallet_transactions wt
      where wt.wallet_id = _wallet_id
        and wt.amount is not null
        and wt.created_at is not null
        and wt.created_at::date = v_current_date
        and wt.created_at::date >= _transaction_from_date
        and wt.created_at::date <= _transaction_to_date
      order by wt.created_at asc, wt.id asc
    loop
      if v_transaction.amount > 0 then
        v_interest_start_date := private.wallet_interest_next_business_day(
          v_transaction.transaction_date
        );
        v_deposits := v_deposits || jsonb_build_array(jsonb_build_object(
          'amount', v_transaction.amount,
          'interestStartDate', to_char(v_interest_start_date, 'YYYY-MM-DD')
        ));
        v_balance := v_balance + v_transaction.amount;
      else
        v_remaining := abs(v_transaction.amount);
        v_balance := v_balance + v_transaction.amount;

        while v_remaining > 0 and jsonb_array_length(v_deposits) > 0 loop
          v_oldest_amount := (v_deposits -> 0 ->> 'amount')::numeric;

          if v_oldest_amount <= v_remaining then
            v_remaining := v_remaining - v_oldest_amount;
            v_deposits := v_deposits - 0;
          else
            v_deposits := jsonb_set(
              v_deposits,
              '{0,amount}',
              to_jsonb(v_oldest_amount - v_remaining),
              false
            );
            v_remaining := 0;
          end if;
        end loop;
      end if;
    end loop;

    select coalesce(sum((value ->> 'amount')::numeric), 0)
    into v_interest_earning_balance
    from jsonb_array_elements(v_deposits)
    where v_current_date >= (value ->> 'interestStartDate')::date;

    select wir.annual_rate::numeric
    into v_rate
    from public.wallet_interest_rates wir
    where wir.config_id = _config_id
      and wir.effective_from <= v_current_date
      and (wir.effective_to is null or v_current_date <= wir.effective_to)
    order by wir.effective_from desc
    limit 1;

    v_is_business_day := private.wallet_interest_is_business_day(v_current_date);
    v_daily_interest := 0;

    if v_is_business_day and v_rate is not null and v_interest_earning_balance > 0 then
      v_daily_interest := floor(v_interest_earning_balance * ((v_rate / 100) / 365));
      v_business_days_count := v_business_days_count + 1;

      if v_daily_interest > 0 then
        v_balance := v_balance + v_daily_interest;
        v_deposits := v_deposits || jsonb_build_array(jsonb_build_object(
          'amount', v_daily_interest,
          'interestStartDate', to_char(v_current_date, 'YYYY-MM-DD')
        ));
      end if;
    end if;

    v_total_interest := v_total_interest + v_daily_interest;
    v_current_date := v_current_date + 1;
  end loop;

  return jsonb_build_object(
    'totalInterest', v_total_interest,
    'businessDaysCount', v_business_days_count,
    'finalBalance', v_balance
  );
end;
$$;

create or replace function private.get_wallet_interest_summary(
  _ws_id uuid,
  _wallet_id uuid,
  _actor_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_average_daily_interest numeric := 0;
  v_config public.wallet_interest_configs%rowtype;
  v_config_json jsonb;
  v_current_rate numeric := 0;
  v_current_rate_json jsonb := 'null'::jsonb;
  v_daily_estimate numeric := 0;
  v_effective_start date;
  v_has_manage_finance boolean;
  v_mtd jsonb;
  v_mtd_start date;
  v_pending_deposits jsonb := '[]'::jsonb;
  v_rate_history jsonb := '[]'::jsonb;
  v_seven_days_ago date;
  v_today date := current_date;
  v_today_result jsonb;
  v_tracking_start date;
  v_transaction record;
  v_transaction_end date;
  v_wallet_balance numeric;
  v_year_start date := date_trunc('year', current_date)::date;
  v_ytd jsonb;
begin
  if _actor_id is null
    or not public.has_workspace_permission(_ws_id, _actor_id, 'view_transactions')
  then
    raise exception 'Permission denied';
  end if;

  v_has_manage_finance := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'manage_finance'
  );

  if not v_has_manage_finance then
    select array_agg(distinct wrww.wallet_id)
    into v_allowed_wallet_ids
    from public.workspace_role_wallet_whitelist wrww
    join public.workspace_role_members wrm
      on wrm.role_id = wrww.role_id
    join public.workspace_roles wr
      on wr.id = wrww.role_id
    where wr.ws_id = _ws_id
      and wrm.user_id = _actor_id;
  end if;

  if not v_has_manage_finance
    and not (_wallet_id = any(coalesce(v_allowed_wallet_ids, '{}'::uuid[])))
  then
    return jsonb_build_object('error', 'wallet_not_found');
  end if;

  select coalesce(ww.balance, 0)::numeric
  into v_wallet_balance
  from public.workspace_wallets ww
  where ww.id = _wallet_id
    and ww.ws_id = _ws_id;

  if not found then
    return jsonb_build_object('error', 'wallet_not_found');
  end if;

  select wic.*
  into v_config
  from public.wallet_interest_configs wic
  where wic.wallet_id = _wallet_id;

  if not found then
    return jsonb_build_object(
      'enabled', false,
      'message', 'Interest tracking not enabled for this wallet'
    );
  end if;

  v_config_json := to_jsonb(v_config);

  if not coalesce(v_config.enabled, false) then
    return jsonb_build_object(
      'enabled', false,
      'config', v_config_json,
      'message', 'Interest tracking is disabled'
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(wir) order by wir.effective_from desc), '[]'::jsonb)
  into v_rate_history
  from public.wallet_interest_rates wir
  where wir.config_id = v_config.id;

  select to_jsonb(wir), wir.annual_rate::numeric
  into v_current_rate_json, v_current_rate
  from public.wallet_interest_rates wir
  where wir.config_id = v_config.id
    and wir.effective_to is null
  order by wir.effective_from desc
  limit 1;

  v_current_rate := coalesce(v_current_rate, 0);
  v_current_rate_json := coalesce(v_current_rate_json, 'null'::jsonb);
  v_daily_estimate := case
    when v_wallet_balance > 0 and v_current_rate > 0 then
      floor(v_wallet_balance * ((v_current_rate / 100) / 365))
    else 0
  end;

  v_tracking_start := coalesce(v_config.tracking_start_date, v_year_start);
  v_effective_start := greatest(v_tracking_start, v_year_start);
  v_transaction_end := least(coalesce(v_config.tracking_end_date, v_today), v_today);
  v_mtd_start := date_trunc('month', v_today)::date;
  v_seven_days_ago := v_today - 7;

  v_ytd := private.wallet_interest_calculation_result(
    _wallet_id,
    v_config.id,
    v_year_start,
    v_today,
    v_effective_start,
    v_transaction_end,
    0
  );

  v_mtd := private.wallet_interest_calculation_result(
    _wallet_id,
    v_config.id,
    v_mtd_start,
    v_today,
    greatest(v_effective_start, v_mtd_start),
    v_transaction_end,
    0
  );

  v_today_result := private.wallet_interest_calculation_result(
    _wallet_id,
    v_config.id,
    v_today,
    v_today,
    greatest(v_effective_start, v_today),
    v_transaction_end,
    v_wallet_balance
  );

  if (v_ytd ->> 'businessDaysCount')::integer > 0 then
    v_average_daily_interest := floor(
      (v_ytd ->> 'totalInterest')::numeric /
      (v_ytd ->> 'businessDaysCount')::numeric
    );
  end if;

  for v_transaction in
    select
      wt.amount::numeric as amount,
      wt.created_at::date as transaction_date
    from public.wallet_transactions wt
    where wt.wallet_id = _wallet_id
      and wt.amount is not null
      and wt.amount > 0
      and wt.created_at is not null
      and wt.created_at::date >= greatest(v_effective_start, v_tracking_start, v_seven_days_ago)
      and wt.created_at::date <= v_today
      and wt.created_at::date <= v_transaction_end
    order by wt.created_at asc, wt.id asc
  loop
    if private.wallet_interest_next_business_day(v_transaction.transaction_date) > v_today then
      v_pending_deposits := v_pending_deposits || jsonb_build_array(jsonb_build_object(
        'depositDate', to_char(v_transaction.transaction_date, 'YYYY-MM-DD'),
        'amount', v_transaction.amount,
        'interestStartDate', to_char(
          private.wallet_interest_next_business_day(v_transaction.transaction_date),
          'YYYY-MM-DD'
        ),
        'daysUntilInterest', greatest(
          private.wallet_interest_next_business_day(v_transaction.transaction_date) - v_today,
          0
        )
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'config', v_config_json,
    'currentRate', v_current_rate_json,
    'rateHistory', v_rate_history,
    'todayInterest', (v_today_result ->> 'totalInterest')::numeric,
    'monthToDateInterest', (v_mtd ->> 'totalInterest')::numeric,
    'yearToDateInterest', (v_ytd ->> 'totalInterest')::numeric,
    'totalEarnedInterest', coalesce(v_config.total_interest_earned, 0),
    'pendingDeposits', v_pending_deposits,
    'projections', jsonb_build_object(
      'week', private.wallet_interest_project_rows(v_wallet_balance, v_current_rate, v_today, 7),
      'month', private.wallet_interest_project_rows(v_wallet_balance, v_current_rate, v_today, 30),
      'quarter', private.wallet_interest_project_rows(v_wallet_balance, v_current_rate, v_today, 90),
      'year', private.wallet_interest_project_rows(v_wallet_balance, v_current_rate, v_today, 365)
    ),
    'averageDailyInterest', v_average_daily_interest,
    'estimatedMonthlyInterest', v_daily_estimate * 22,
    'estimatedYearlyInterest', v_daily_estimate * 260
  );
end;
$$;

revoke all on function private.wallet_interest_is_business_day(date)
from public, anon, authenticated;
revoke all on function private.wallet_interest_next_business_day(date)
from public, anon, authenticated;
revoke all on function private.wallet_interest_project_rows(numeric, numeric, date, integer)
from public, anon, authenticated;
revoke all on function private.wallet_interest_calculation_result(
  uuid,
  uuid,
  date,
  date,
  date,
  date,
  numeric
) from public, anon, authenticated;
revoke all on function private.get_wallet_interest_summary(uuid, uuid, uuid)
from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_wallet_interest_summary(uuid, uuid, uuid)
to service_role;

comment on function private.get_wallet_interest_summary(uuid, uuid, uuid) is
  'Server-owned finance helper that returns wallet interest summary, pending deposits, projections, and interest totals in one database calculation.';
