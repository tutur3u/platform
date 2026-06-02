create schema if not exists private;

drop function if exists private.wallet_interest_calculation_result(
  uuid,
  uuid,
  date,
  date,
  date,
  date,
  numeric
);

create or replace function private.get_wallet_interest_visible_balance(
  _wallet_id uuid,
  _can_view_confidential_amounts boolean
)
returns numeric
language plpgsql
security definer
stable
set search_path = private, public, pg_temp
as $$
declare
  v_balance numeric;
begin
  if _can_view_confidential_amounts then
    select coalesce(ww.balance, 0)::numeric
    into v_balance
    from private.workspace_wallets ww
    where ww.id = _wallet_id;
  else
    select coalesce(sum(wt.amount), 0)::numeric
    into v_balance
    from public.wallet_transactions wt
    where wt.wallet_id = _wallet_id
      and not wt.is_amount_confidential;
  end if;

  return coalesce(v_balance, 0);
end;
$$;

create or replace function private.get_wallet_interest_initial_balance(
  _ws_id uuid,
  _wallet_id uuid,
  _actor_id uuid,
  _from_date date
)
returns numeric
language plpgsql
security definer
stable
set search_path = private, public, pg_temp
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_balance numeric;
  v_can_view_amount boolean;
  v_has_manage_finance boolean;
  v_transaction_sum numeric;
begin
  if _actor_id is null
    or not public.has_workspace_permission(_ws_id, _actor_id, 'view_transactions')
  then
    raise exception 'Permission denied';
  end if;

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );
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
    return null;
  end if;

  perform 1
  from private.workspace_wallets ww
  where ww.id = _wallet_id
    and ww.ws_id = _ws_id;

  if not found then
    return null;
  end if;

  v_balance := private.get_wallet_interest_visible_balance(
    _wallet_id,
    v_can_view_amount
  );

  select coalesce(sum(wt.amount), 0)::numeric
  into v_transaction_sum
  from public.wallet_transactions wt
  where wt.wallet_id = _wallet_id
    and wt.created_at >= _from_date::timestamp with time zone
    and (not wt.is_amount_confidential or v_can_view_amount);

  return greatest(0, v_balance - v_transaction_sum);
end;
$$;

create or replace function private.wallet_interest_calculation_result(
  _wallet_id uuid,
  _config_id uuid,
  _from_date date,
  _to_date date,
  _transaction_from_date date,
  _transaction_to_date date,
  _initial_balance numeric default 0,
  _include_confidential_amounts boolean default true
)
returns jsonb
language plpgsql
security definer
stable
set search_path = private, public, pg_temp
as $$
declare
  v_balance numeric := coalesce(_initial_balance, 0);
  v_business_days_count integer := 0;
  v_current_date date := _from_date;
  v_daily_interest numeric;
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
        and (not wt.is_amount_confidential or _include_confidential_amounts)
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
set search_path = private, public, pg_temp
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_average_daily_interest numeric := 0;
  v_can_view_amount boolean;
  v_can_view_description boolean;
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
  v_total_earned_interest numeric := 0;
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

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );
  v_can_view_description := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_description'
  );
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

  perform 1
  from private.workspace_wallets ww
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

  if not v_can_view_amount then
    v_config_json := v_config_json || jsonb_build_object(
      'last_interest_amount',
      0,
      'total_interest_earned',
      0
    );
  end if;

  if not coalesce(v_config.enabled, false) then
    return jsonb_build_object(
      'enabled', false,
      'config', v_config_json,
      'message', 'Interest tracking is disabled'
    );
  end if;

  v_wallet_balance := private.get_wallet_interest_visible_balance(
    _wallet_id,
    v_can_view_amount
  );

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
    0,
    v_can_view_amount
  );

  v_mtd := private.wallet_interest_calculation_result(
    _wallet_id,
    v_config.id,
    v_mtd_start,
    v_today,
    greatest(v_effective_start, v_mtd_start),
    v_transaction_end,
    0,
    v_can_view_amount
  );

  v_today_result := private.wallet_interest_calculation_result(
    _wallet_id,
    v_config.id,
    v_today,
    v_today,
    greatest(v_effective_start, v_today),
    v_transaction_end,
    v_wallet_balance,
    v_can_view_amount
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
      wt.created_at::date as transaction_date,
      case
        when wt.is_description_confidential and not v_can_view_description then '[CONFIDENTIAL]'
        else coalesce(wt.description, '')
      end as description
    from public.wallet_transactions wt
    where wt.wallet_id = _wallet_id
      and wt.amount is not null
      and wt.amount > 0
      and wt.created_at is not null
      and wt.created_at::date >= greatest(v_effective_start, v_tracking_start, v_seven_days_ago)
      and wt.created_at::date <= v_today
      and wt.created_at::date <= v_transaction_end
      and (not wt.is_amount_confidential or v_can_view_amount)
    order by wt.created_at asc, wt.id asc
  loop
    if private.wallet_interest_next_business_day(v_transaction.transaction_date) > v_today then
      v_pending_deposits := v_pending_deposits || jsonb_build_array(jsonb_build_object(
        'depositDate', to_char(v_transaction.transaction_date, 'YYYY-MM-DD'),
        'amount', v_transaction.amount,
        'description', v_transaction.description,
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

  if v_can_view_amount then
    v_total_earned_interest := coalesce(v_config.total_interest_earned, 0);
  else
    v_total_earned_interest := coalesce((v_ytd ->> 'totalInterest')::numeric, 0);
  end if;

  return jsonb_build_object(
    'config', v_config_json,
    'currentRate', v_current_rate_json,
    'rateHistory', v_rate_history,
    'todayInterest', (v_today_result ->> 'totalInterest')::numeric,
    'monthToDateInterest', (v_mtd ->> 'totalInterest')::numeric,
    'yearToDateInterest', (v_ytd ->> 'totalInterest')::numeric,
    'totalEarnedInterest', v_total_earned_interest,
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

create or replace function private.get_wallet_interest_projection(
  _ws_id uuid,
  _wallet_id uuid,
  _actor_id uuid,
  _start_date date,
  _days integer
)
returns jsonb
language plpgsql
security definer
stable
set search_path = private, public, pg_temp
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_business_days integer := 0;
  v_can_view_amount boolean;
  v_config_enabled boolean;
  v_config_id uuid;
  v_current_balance numeric;
  v_current_date date := _start_date;
  v_current_rate numeric;
  v_daily_interest numeric;
  v_days integer := least(greatest(coalesce(_days, 30), 1), 365);
  v_final_balance numeric;
  v_has_manage_finance boolean;
  v_index integer;
  v_is_business_day boolean;
  v_non_business_days integer;
  v_percentage_gain text;
  v_projected_balance numeric;
  v_projections jsonb := '[]'::jsonb;
  v_total_interest numeric := 0;
begin
  if _actor_id is null
    or not public.has_workspace_permission(_ws_id, _actor_id, 'view_transactions')
  then
    raise exception 'Permission denied';
  end if;

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );
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

  perform 1
  from private.workspace_wallets ww
  where ww.id = _wallet_id
    and ww.ws_id = _ws_id;

  if not found then
    return jsonb_build_object('error', 'wallet_not_found');
  end if;

  select wic.id, wic.enabled
  into v_config_id, v_config_enabled
  from public.wallet_interest_configs wic
  where wic.wallet_id = _wallet_id;

  if not found then
    return jsonb_build_object('error', 'not_enabled');
  end if;

  if not coalesce(v_config_enabled, false) then
    return jsonb_build_object('error', 'disabled');
  end if;

  select wir.annual_rate::numeric
  into v_current_rate
  from public.wallet_interest_rates wir
  where wir.config_id = v_config_id
    and wir.effective_to is null
  order by wir.effective_from desc
  limit 1;

  if coalesce(v_current_rate, 0) <= 0 then
    return jsonb_build_object('error', 'no_active_rate');
  end if;

  v_current_balance := private.get_wallet_interest_visible_balance(
    _wallet_id,
    v_can_view_amount
  );
  v_projected_balance := v_current_balance;

  for v_index in 1..v_days loop
    v_is_business_day := private.wallet_interest_is_business_day(v_current_date);
    v_daily_interest := 0;

    if v_is_business_day and v_projected_balance > 0 and v_current_rate > 0 then
      v_daily_interest := floor(v_projected_balance * ((v_current_rate / 100) / 365));
      v_projected_balance := v_projected_balance + v_daily_interest;
      v_business_days := v_business_days + 1;
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

  v_final_balance := v_projected_balance;
  v_non_business_days := v_days - v_business_days;
  v_percentage_gain := case
    when v_current_balance > 0 then to_char(
      ((v_final_balance - v_current_balance) / v_current_balance) * 100,
      'FM999999999990.0000'
    )
    else '0'
  end;

  return jsonb_build_object(
    'startDate', to_char(_start_date, 'YYYY-MM-DD'),
    'days', v_days,
    'currentBalance', v_current_balance,
    'currentRate', v_current_rate,
    'projections', v_projections,
    'summary', jsonb_build_object(
      'totalProjectedInterest', v_total_interest,
      'businessDays', v_business_days,
      'nonBusinessDays', v_non_business_days,
      'finalBalance', v_final_balance,
      'percentageGain', v_percentage_gain
    )
  );
end;
$$;

create or replace function private.calculate_wallet_interest(
  _ws_id uuid,
  _wallet_id uuid,
  _actor_id uuid,
  _from_date date,
  _to_date date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = private, public, pg_temp
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_balance numeric;
  v_business_days_count integer := 0;
  v_can_view_amount boolean;
  v_config_id uuid;
  v_config_enabled boolean;
  v_cumulative_interest numeric := 0;
  v_current_date date := _from_date;
  v_daily_interest numeric;
  v_daily_results jsonb := '[]'::jsonb;
  v_deposits jsonb := '[]'::jsonb;
  v_has_manage_finance boolean;
  v_initial_balance numeric;
  v_interest_earning_balance numeric;
  v_interest_start_date date;
  v_is_business_day boolean;
  v_non_business_days_count integer := 0;
  v_oldest_amount numeric;
  v_rate numeric;
  v_remaining numeric;
  v_transaction record;
begin
  if _actor_id is null
    or not public.has_workspace_permission(_ws_id, _actor_id, 'view_transactions')
  then
    raise exception 'Permission denied';
  end if;

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );
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

  perform 1
  from private.workspace_wallets ww
  where ww.id = _wallet_id
    and ww.ws_id = _ws_id;

  if not found then
    return jsonb_build_object('error', 'wallet_not_found');
  end if;

  select wic.id, wic.enabled
  into v_config_id, v_config_enabled
  from public.wallet_interest_configs wic
  where wic.wallet_id = _wallet_id;

  if not found then
    return jsonb_build_object('error', 'not_enabled');
  end if;

  if not coalesce(v_config_enabled, false) then
    return jsonb_build_object('error', 'disabled');
  end if;

  v_initial_balance := private.get_wallet_interest_initial_balance(
    _ws_id,
    _wallet_id,
    _actor_id,
    _from_date
  );

  if v_initial_balance is null then
    return jsonb_build_object('error', 'wallet_not_found');
  end if;

  v_balance := greatest(0, coalesce(v_initial_balance, 0));

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
        and wt.created_at::date >= _from_date
        and wt.created_at::date <= _to_date
        and (not wt.is_amount_confidential or v_can_view_amount)
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
    where wir.config_id = v_config_id
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
    else
      v_non_business_days_count := v_non_business_days_count + 1;
    end if;

    v_cumulative_interest := v_cumulative_interest + v_daily_interest;
    v_daily_results := v_daily_results || jsonb_build_array(jsonb_build_object(
      'date', to_char(v_current_date, 'YYYY-MM-DD'),
      'balance', v_interest_earning_balance,
      'rate', coalesce(v_rate, 0),
      'dailyInterest', v_daily_interest,
      'isBusinessDay', v_is_business_day,
      'cumulativeInterest', v_cumulative_interest
    ));

    v_current_date := v_current_date + 1;
  end loop;

  return jsonb_build_object(
    'fromDate', to_char(_from_date, 'YYYY-MM-DD'),
    'toDate', to_char(_to_date, 'YYYY-MM-DD'),
    'initialBalance', v_initial_balance,
    'dailyResults', v_daily_results,
    'totalInterest', v_cumulative_interest,
    'finalBalance', v_balance,
    'businessDaysCount', v_business_days_count,
    'nonBusinessDaysCount', v_non_business_days_count
  );
end;
$$;

create or replace function private.detect_wallet_interest_transactions(
  _ws_id uuid,
  _wallet_id uuid,
  _actor_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = private, public, pg_temp
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_balance numeric;
  v_can_view_amount boolean;
  v_can_view_description boolean;
  v_config_id uuid;
  v_detected jsonb := '[]'::jsonb;
  v_expected_daily_interest numeric;
  v_has_manage_finance boolean;
  v_high_confidence integer := 0;
  v_low_confidence integer := 0;
  v_medium_confidence integer := 0;
  v_start_date date := current_date - 90;
  v_total_amount numeric := 0;
  v_tracking_end_date date;
  v_tracking_start_date date;
begin
  if _actor_id is null
    or not public.has_workspace_permission(_ws_id, _actor_id, 'view_transactions')
  then
    raise exception 'Permission denied';
  end if;

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );
  v_can_view_description := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_description'
  );
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

  perform 1
  from private.workspace_wallets ww
  where ww.id = _wallet_id
    and ww.ws_id = _ws_id;

  if not found then
    return jsonb_build_object('error', 'wallet_not_found');
  end if;

  v_balance := private.get_wallet_interest_visible_balance(
    _wallet_id,
    v_can_view_amount
  );

  select
    wic.id,
    wic.tracking_start_date,
    wic.tracking_end_date
  into v_config_id, v_tracking_start_date, v_tracking_end_date
  from public.wallet_interest_configs wic
  where wic.wallet_id = _wallet_id;

  v_start_date := coalesce(v_tracking_start_date, v_start_date);

  if v_config_id is not null and coalesce(v_balance, 0) > 0 then
    select floor(v_balance * ((wir.annual_rate::numeric / 100) / 365))
    into v_expected_daily_interest
    from public.wallet_interest_rates wir
    where wir.config_id = v_config_id
      and wir.effective_to is null
    order by wir.effective_from desc
    limit 1;
  end if;

  with raw_candidates as (
    select
      wt.id,
      wt.created_at,
      wt.created_at::date as transaction_date,
      wt.amount::numeric as amount,
      case
        when wt.is_description_confidential and not v_can_view_description then ''
        else coalesce(wt.description, '')
      end as match_description,
      case
        when wt.is_description_confidential and not v_can_view_description then '[CONFIDENTIAL]'
        else coalesce(wt.description, '')
      end as return_description
    from public.wallet_transactions wt
    where wt.wallet_id = _wallet_id
      and wt.id is not null
      and wt.created_at is not null
      and wt.amount is not null
      and wt.amount > 0
      and (not wt.is_amount_confidential or v_can_view_amount)
      and wt.created_at >= v_start_date::timestamp with time zone
      and (
        v_tracking_end_date is null
        or wt.created_at < (v_tracking_end_date + 1)::timestamp with time zone
      )
  ), candidates as (
    select
      id,
      created_at,
      transaction_date,
      amount,
      return_description as description,
      match_description ~* (
        'lãi\s*suất|'
        || 'lãi\s*hàng\s*ngày|'
        || 'tiền\s*lãi|'
        || 'lãi\s*tiết\s*kiệm|'
        || 'sinh\s*lời|'
        || 'lợi\s*nhuận|'
        || 'interest|'
        || 'daily\s*interest|'
        || 'interest\s*earned|'
        || 'interest\s*payment|'
        || 'momo\s*(interest|reward|lãi)|'
        || 'zalopay\s*(interest|reward|lãi)|'
        || 'ví\s*(momo|zalopay).*lãi'
      ) as description_match,
      v_expected_daily_interest is not null
        and v_expected_daily_interest > 0
        and abs(amount - v_expected_daily_interest)
          / v_expected_daily_interest <= 0.1 as amount_match
    from raw_candidates
  ), detected_rows as (
    select
      id,
      created_at,
      transaction_date,
      amount,
      description,
      case
        when description_match then 'high'
        when amount_match then 'medium'
        else 'low'
      end as confidence,
      concat_ws(
        '; ',
        case
          when description_match then 'Description matches interest pattern'
        end,
        case
          when amount_match then 'Amount matches expected daily interest'
        end
      ) as match_reason
    from candidates
    where description_match or amount_match
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'transactionId', id,
          'date', to_char(transaction_date, 'YYYY-MM-DD'),
          'amount', amount,
          'description', description,
          'confidence', confidence,
          'matchReason', match_reason
        )
        order by transaction_date desc, created_at desc, id desc
      ),
      '[]'::jsonb
    ),
    coalesce(sum(amount), 0),
    count(*) filter (where confidence = 'high'),
    count(*) filter (where confidence = 'medium'),
    count(*) filter (where confidence = 'low')
  into
    v_detected,
    v_total_amount,
    v_high_confidence,
    v_medium_confidence,
    v_low_confidence
  from detected_rows;

  return jsonb_build_object(
    'detected', v_detected,
    'totalAmount', v_total_amount,
    'summary', jsonb_build_object(
      'highConfidence', v_high_confidence,
      'mediumConfidence', v_medium_confidence,
      'lowConfidence', v_low_confidence
    )
  );
end;
$$;

revoke all on function private.get_wallet_interest_visible_balance(uuid, boolean)
from public, anon, authenticated;
revoke all on function private.get_wallet_interest_initial_balance(uuid, uuid, uuid, date)
from public, anon, authenticated;
revoke all on function private.wallet_interest_calculation_result(
  uuid,
  uuid,
  date,
  date,
  date,
  date,
  numeric,
  boolean
) from public, anon, authenticated;
revoke all on function private.get_wallet_interest_summary(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function private.get_wallet_interest_projection(uuid, uuid, uuid, date, integer)
from public, anon, authenticated;
revoke all on function private.calculate_wallet_interest(uuid, uuid, uuid, date, date)
from public, anon, authenticated;
revoke all on function private.detect_wallet_interest_transactions(uuid, uuid, uuid)
from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_wallet_interest_visible_balance(uuid, boolean)
to service_role;
grant execute on function private.get_wallet_interest_initial_balance(uuid, uuid, uuid, date)
to service_role;
grant execute on function private.wallet_interest_calculation_result(
  uuid,
  uuid,
  date,
  date,
  date,
  date,
  numeric,
  boolean
) to service_role;
grant execute on function private.get_wallet_interest_summary(uuid, uuid, uuid)
to service_role;
grant execute on function private.get_wallet_interest_projection(uuid, uuid, uuid, date, integer)
to service_role;
grant execute on function private.calculate_wallet_interest(uuid, uuid, uuid, date, date)
to service_role;
grant execute on function private.detect_wallet_interest_transactions(uuid, uuid, uuid)
to service_role;

comment on function private.get_wallet_interest_visible_balance(uuid, boolean) is
  'Server-owned finance helper that returns a wallet balance with confidential amount rows excluded unless the actor can view them.';
comment on function private.get_wallet_interest_initial_balance(uuid, uuid, uuid, date) is
  'Server-owned finance helper that derives a wallet interest starting balance using the actor visible amount set.';
comment on function private.wallet_interest_calculation_result(
  uuid,
  uuid,
  date,
  date,
  date,
  date,
  numeric,
  boolean
) is
  'Server-owned finance helper that calculates wallet interest totals from the caller visible amount set.';
comment on function private.get_wallet_interest_summary(uuid, uuid, uuid) is
  'Server-owned finance helper that returns wallet interest summary, pending deposits, projections, and interest totals with confidential amount redaction.';
comment on function private.get_wallet_interest_projection(uuid, uuid, uuid, date, integer) is
  'Server-owned finance helper that returns wallet interest projection rows and summary totals with confidential amount redaction.';
comment on function private.calculate_wallet_interest(uuid, uuid, uuid, date, date) is
  'Server-owned finance helper that calculates wallet interest daily rows and totals for a date range with confidential amount redaction.';
comment on function private.detect_wallet_interest_transactions(uuid, uuid, uuid) is
  'Server-owned finance helper that detects wallet interest transactions from the actor visible amount and description set.';
