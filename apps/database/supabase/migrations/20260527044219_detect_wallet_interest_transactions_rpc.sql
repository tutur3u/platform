create schema if not exists private;

drop function if exists private.detect_wallet_interest_transactions(uuid, uuid, uuid);

create index if not exists idx_wallet_transactions_wallet_created_at_income
on public.wallet_transactions (wallet_id, created_at desc)
where amount > 0;

create or replace function private.detect_wallet_interest_transactions(
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
  v_balance numeric;
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

  select ww.balance::numeric
  into v_balance
  from public.workspace_wallets ww
  where ww.id = _wallet_id
    and ww.ws_id = _ws_id;

  if not found then
    return jsonb_build_object('error', 'wallet_not_found');
  end if;

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

  with candidates as (
    select
      wt.id,
      wt.created_at,
      wt.created_at::date as transaction_date,
      wt.amount::numeric as amount,
      coalesce(wt.description, '') as description,
      coalesce(wt.description, '') ~* (
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
        and abs(wt.amount::numeric - v_expected_daily_interest)
          / v_expected_daily_interest <= 0.1 as amount_match
    from public.wallet_transactions wt
    where wt.wallet_id = _wallet_id
      and wt.id is not null
      and wt.created_at is not null
      and wt.amount is not null
      and wt.amount > 0
      and wt.created_at >= v_start_date::timestamp with time zone
      and (
        v_tracking_end_date is null
        or wt.created_at < (v_tracking_end_date + 1)::timestamp with time zone
      )
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

revoke all on function private.detect_wallet_interest_transactions(uuid, uuid, uuid)
from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.detect_wallet_interest_transactions(uuid, uuid, uuid)
to service_role;

comment on function private.detect_wallet_interest_transactions(uuid, uuid, uuid) is
  'Server-owned finance helper that detects wallet interest transactions, confidence buckets, and total amount in Postgres.';
