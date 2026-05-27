create schema if not exists private;

drop function if exists private.calculate_wallet_interest(uuid, uuid, uuid, date, date);

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
set search_path = public
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_balance numeric;
  v_business_days_count integer := 0;
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
  from public.workspace_wallets ww
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

revoke all on function private.calculate_wallet_interest(uuid, uuid, uuid, date, date)
from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.calculate_wallet_interest(uuid, uuid, uuid, date, date)
to service_role;

comment on function private.calculate_wallet_interest(uuid, uuid, uuid, date, date) is
  'Server-owned finance helper that calculates wallet interest daily rows and totals for a date range in Postgres.';
