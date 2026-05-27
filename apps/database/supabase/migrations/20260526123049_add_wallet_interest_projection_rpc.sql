create schema if not exists private;

drop function if exists private.get_wallet_interest_projection(
  uuid,
  uuid,
  uuid,
  date,
  integer
);

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
set search_path = public
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_business_days integer := 0;
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
  into v_current_balance
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

  v_projected_balance := v_current_balance;

  for v_index in 1..v_days loop
    v_is_business_day := extract(dow from v_current_date) not in (0, 6)
      and not exists (
        select 1
        from public.vietnamese_holidays vh
        where vh.date = v_current_date
      );

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

revoke all on function private.get_wallet_interest_projection(
  uuid,
  uuid,
  uuid,
  date,
  integer
) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_wallet_interest_projection(
  uuid,
  uuid,
  uuid,
  date,
  integer
) to service_role;

comment on function private.get_wallet_interest_projection(
  uuid,
  uuid,
  uuid,
  date,
  integer
) is
  'Server-owned finance helper that returns wallet interest projection rows and summary totals in one database calculation.';
