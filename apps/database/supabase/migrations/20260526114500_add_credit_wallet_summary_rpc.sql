create schema if not exists private;

-- Clamp a requested billing day to the actual day count in a target month.
create or replace function private.finance_credit_cycle_date(
  p_anchor_year integer,
  p_month_offset integer,
  p_day integer
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_first_day date;
  v_last_day integer;
begin
  v_first_day := (
    make_date(p_anchor_year, 1, 1)
    + (p_month_offset || ' months')::interval
  )::date;
  v_last_day := extract(
    day from (date_trunc('month', v_first_day) + interval '1 month - 1 day')::date
  )::integer;

  return make_date(
    extract(year from v_first_day)::integer,
    extract(month from v_first_day)::integer,
    least(greatest(p_day, 1), v_last_day)
  );
end;
$$;

create or replace function private.get_credit_wallet_summary(
  _ws_id uuid,
  _wallet_id uuid,
  _actor_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, private
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_available_credit numeric;
  v_balance numeric;
  v_can_view_amount boolean;
  v_current_activity numeric;
  v_current_month_offset integer;
  v_has_manage_finance boolean;
  v_last_statement_close date;
  v_limit numeric;
  v_next_payment_due date;
  v_next_statement_close date;
  v_payment_day integer;
  v_prev_cycle_start date;
  v_statement_balance numeric;
  v_statement_day integer;
  v_today date := current_date;
  v_total_outstanding numeric;
  v_utilization integer;
  v_wallet record;
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

  select
    ww.balance,
    cw.limit,
    cw.statement_date,
    cw.payment_date
  into v_wallet
  from public.workspace_wallets ww
  join public.credit_wallets cw
    on cw.wallet_id = ww.id
  where ww.id = _wallet_id
    and ww.ws_id = _ws_id;

  if not found then
    return null;
  end if;

  v_limit := coalesce(v_wallet.limit, 0)::numeric;
  v_statement_day := least(greatest(coalesce(v_wallet.statement_date, 1), 1), 31);
  v_payment_day := least(greatest(coalesce(v_wallet.payment_date, 1), 1), 31);
  v_current_month_offset := extract(month from v_today)::integer - 1;

  v_last_statement_close := private.finance_credit_cycle_date(
    extract(year from v_today)::integer,
    v_current_month_offset,
    v_statement_day
  );

  if v_last_statement_close > v_today then
    v_last_statement_close := private.finance_credit_cycle_date(
      extract(year from v_today)::integer,
      v_current_month_offset - 1,
      v_statement_day
    );
  end if;

  v_prev_cycle_start := private.finance_credit_cycle_date(
    extract(year from v_last_statement_close)::integer,
    extract(month from v_last_statement_close)::integer - 2,
    v_statement_day
  );

  v_next_statement_close := private.finance_credit_cycle_date(
    extract(year from v_last_statement_close)::integer,
    extract(month from v_last_statement_close)::integer,
    v_statement_day
  );

  v_next_payment_due := private.finance_credit_cycle_date(
    extract(year from v_today)::integer,
    v_current_month_offset,
    v_payment_day
  );

  if v_next_payment_due < v_today then
    v_next_payment_due := private.finance_credit_cycle_date(
      extract(year from v_today)::integer,
      v_current_month_offset + 1,
      v_payment_day
    );
  end if;

  if v_can_view_amount then
    v_balance := coalesce(v_wallet.balance, 0)::numeric;
  else
    select coalesce(sum(wt.amount), 0)
    into v_balance
    from public.wallet_transactions wt
    where wt.wallet_id = _wallet_id
      and not wt.is_amount_confidential;
  end if;

  select coalesce(sum(wt.amount), 0)
  into v_statement_balance
  from public.wallet_transactions wt
  where wt.wallet_id = _wallet_id
    and wt.taken_at >= v_prev_cycle_start::timestamp with time zone
    and wt.taken_at < v_last_statement_close::timestamp with time zone
    and (not wt.is_amount_confidential or v_can_view_amount);

  select coalesce(sum(wt.amount), 0)
  into v_current_activity
  from public.wallet_transactions wt
  where wt.wallet_id = _wallet_id
    and wt.taken_at >= v_last_statement_close::timestamp with time zone
    and wt.taken_at < v_next_statement_close::timestamp with time zone
    and (not wt.is_amount_confidential or v_can_view_amount);

  v_total_outstanding := case
    when v_balance < 0 then abs(v_balance)
    else 0
  end;
  v_available_credit := v_limit - v_total_outstanding;
  v_utilization := case
    when v_limit > 0 then least(100, round((v_total_outstanding / v_limit) * 100)::integer)
    else 0
  end;

  return jsonb_build_object(
    'limit', v_limit,
    'balance', v_balance,
    'availableCredit', v_available_credit,
    'totalOutstanding', v_total_outstanding,
    'utilization', v_utilization,
    'statementBalance', v_statement_balance,
    'currentActivity', v_current_activity,
    'nextStatementDate', to_char(v_next_statement_close, 'YYYY-MM-DD'),
    'daysUntilStatement', v_next_statement_close - v_today,
    'nextPaymentDate', to_char(v_next_payment_due, 'YYYY-MM-DD'),
    'daysUntilPayment', v_next_payment_due - v_today,
    'cycleStart', to_char(v_last_statement_close, 'YYYY-MM-DD'),
    'cycleEnd', to_char(v_next_statement_close, 'YYYY-MM-DD'),
    'prevCycleStart', to_char(v_prev_cycle_start, 'YYYY-MM-DD'),
    'prevCycleEnd', to_char(v_last_statement_close, 'YYYY-MM-DD')
  );
end;
$$;

revoke all on function private.finance_credit_cycle_date(
  integer,
  integer,
  integer
) from public, anon, authenticated;
revoke all on function private.get_credit_wallet_summary(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.finance_credit_cycle_date(
  integer,
  integer,
  integer
) to service_role;
grant execute on function private.get_credit_wallet_summary(
  uuid,
  uuid,
  uuid
) to service_role;

comment on function private.get_credit_wallet_summary(uuid, uuid, uuid) is
  'Server-owned finance helper that returns credit wallet billing-cycle balances, activity, utilization, and upcoming due dates in one database calculation.';
