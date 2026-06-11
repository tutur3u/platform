create or replace function private.get_wallet_checkpoint_audit_status(
  _wallet_ids uuid[]
)
returns table (
  wallet_id uuid,
  latest_checkpoint_id uuid,
  latest_checked_at timestamp with time zone,
  latest_actual_balance numeric,
  checkpoint_ledger_balance numeric,
  post_checkpoint_delta numeric,
  post_checkpoint_transaction_count bigint,
  ledger_balance numeric,
  audited_balance numeric,
  variance numeric,
  status text
)
language sql
security definer
stable
set search_path = private, public, pg_temp
as $$
  with scoped_wallets as (
    select
      ww.id,
      coalesce(ww.balance, 0)::numeric as ledger_balance
    from private.workspace_wallets ww
    where ww.id = any(coalesce(_wallet_ids, array[]::uuid[]))
  )
  select
    wallet.id as wallet_id,
    latest.id as latest_checkpoint_id,
    latest.checked_at as latest_checked_at,
    latest.actual_balance as latest_actual_balance,
    latest.ledger_balance as checkpoint_ledger_balance,
    coalesce(post_checkpoint.delta, 0)::numeric as post_checkpoint_delta,
    coalesce(post_checkpoint.transaction_count, 0)::bigint
      as post_checkpoint_transaction_count,
    wallet.ledger_balance,
    case
      when latest.id is null then wallet.ledger_balance
      else (latest.actual_balance + coalesce(post_checkpoint.delta, 0))::numeric
    end as audited_balance,
    case
      when latest.id is null then 0::numeric
      else (
        latest.actual_balance
        + coalesce(post_checkpoint.delta, 0)
        - wallet.ledger_balance
      )::numeric
    end as variance,
    case
      when latest.id is null then 'no_checkpoint'
      when (
        latest.actual_balance
        + coalesce(post_checkpoint.delta, 0)
        - wallet.ledger_balance
      ) = 0 then 'clean'
      else 'unresolved'
    end as status
  from scoped_wallets wallet
  left join lateral (
    select
      wcp.id,
      wcp.checked_at,
      wcp.actual_balance,
      wcp.ledger_balance
    from private.workspace_wallet_checkpoints wcp
    where wcp.wallet_id = wallet.id
    order by wcp.checked_at desc, wcp.created_at desc, wcp.id desc
    limit 1
  ) latest on true
  left join lateral (
    select
      coalesce(sum(wt.amount), 0)::numeric as delta,
      count(wt.id)::bigint as transaction_count
    from public.wallet_transactions wt
    where wt.wallet_id = wallet.id
      and latest.id is not null
      and wt.taken_at > latest.checked_at
  ) post_checkpoint on true
$$;

create or replace function private.create_wallet_checkpoint_reconciliation(
  _wallet_id uuid,
  _checkpoint_id uuid,
  _actor_id uuid,
  _category_id uuid default null,
  _description text default null,
  _basis text default 'checkpoint'
)
returns table (
  transaction_id uuid,
  offset_amount numeric,
  checked_at timestamp with time zone,
  created boolean,
  wallet_id uuid,
  checkpoint_id uuid
)
language plpgsql
security definer
volatile
set search_path = private, public, pg_temp
as $$
declare
  v_basis text := coalesce(nullif(_basis, ''), 'checkpoint');
  v_checkpoint record;
  v_ledger_delta numeric;
  v_previous_checkpoint record;
  v_offset numeric;
  v_transaction_id uuid;
begin
  if v_basis not in ('checkpoint', 'interval') then
    raise exception 'invalid reconciliation basis %', v_basis
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_checkpoint_id::text, 0));

  select
    wcp.id as checkpoint_id,
    wcp.wallet_id,
    wcp.checked_at,
    wcp.actual_balance,
    ww.name as wallet_name
  into v_checkpoint
  from private.workspace_wallet_checkpoints wcp
  join private.workspace_wallets ww on ww.id = wcp.wallet_id
  where wcp.id = _checkpoint_id
    and wcp.wallet_id = _wallet_id
  for update of wcp;

  if not found then
    raise exception 'checkpoint % not found for wallet %', _checkpoint_id, _wallet_id
      using errcode = 'P0002';
  end if;

  if v_basis = 'interval' then
    select
      wcp.id,
      wcp.checked_at,
      wcp.actual_balance
    into v_previous_checkpoint
    from private.workspace_wallet_checkpoints wcp
    where wcp.wallet_id = _wallet_id
      and wcp.checked_at < v_checkpoint.checked_at
    order by wcp.checked_at desc, wcp.created_at desc, wcp.id desc
    limit 1;

    if not found then
      raise exception 'previous checkpoint not found for checkpoint %', _checkpoint_id
        using errcode = 'P0002';
    end if;

    select coalesce(sum(wt.amount), 0)::numeric
    into v_ledger_delta
    from public.wallet_transactions wt
    where wt.wallet_id = _wallet_id
      and wt.taken_at > v_previous_checkpoint.checked_at
      and wt.taken_at <= v_checkpoint.checked_at;

    v_offset :=
      (
        v_checkpoint.actual_balance
        - v_previous_checkpoint.actual_balance
        - v_ledger_delta
      )::numeric;
  else
    v_offset :=
      v_checkpoint.actual_balance
      - private.get_wallet_ledger_balance_at(
        _wallet_id,
        v_checkpoint.checked_at
      );
  end if;

  if v_offset = 0 then
    return query
    select
      null::uuid,
      0::numeric,
      v_checkpoint.checked_at,
      false,
      _wallet_id,
      _checkpoint_id;
    return;
  end if;

  insert into public.wallet_transactions (
    amount,
    description,
    wallet_id,
    category_id,
    taken_at,
    report_opt_in,
    platform_creator_id
  )
  values (
    v_offset,
    coalesce(
      nullif(_description, ''),
      format(
        'Wallet %s reconciliation for %s at %s',
        v_basis,
        coalesce(v_checkpoint.wallet_name, 'wallet'),
        v_checkpoint.checked_at
      )
    ),
    _wallet_id,
    _category_id,
    v_checkpoint.checked_at,
    false,
    _actor_id
  )
  returning id into v_transaction_id;

  return query
  select
    v_transaction_id,
    v_offset,
    v_checkpoint.checked_at,
    true,
    _wallet_id,
    _checkpoint_id;
end;
$$;

revoke all on function private.get_wallet_checkpoint_audit_status(uuid[])
from public, anon, authenticated;

revoke all on function private.create_wallet_checkpoint_reconciliation(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function private.get_wallet_checkpoint_audit_status(uuid[])
to service_role;

grant execute on function private.create_wallet_checkpoint_reconciliation(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;

comment on function private.get_wallet_checkpoint_audit_status(uuid[]) is
  'Returns latest-checkpoint audited balance status for wallet surfaces. Audited balance is the latest observed actual balance plus transactions after that checkpoint.';

comment on function private.create_wallet_checkpoint_reconciliation(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) is
  'Creates one reviewed reconciliation transaction at the checkpoint timestamp after recomputing the exact signed checkpoint or interval offset under a checkpoint-scoped advisory lock.';
