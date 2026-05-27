create schema if not exists private;

drop function if exists private.get_wallet_interest_initial_balance(
  uuid,
  uuid,
  uuid,
  date
);

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
set search_path = public
as $$
declare
  v_allowed_wallet_ids uuid[];
  v_balance numeric;
  v_has_manage_finance boolean;
  v_transaction_sum numeric;
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
    return null;
  end if;

  select coalesce(ww.balance, 0)::numeric
  into v_balance
  from public.workspace_wallets ww
  where ww.id = _wallet_id
    and ww.ws_id = _ws_id;

  if not found then
    return null;
  end if;

  select coalesce(sum(wt.amount), 0)::numeric
  into v_transaction_sum
  from public.wallet_transactions wt
  where wt.wallet_id = _wallet_id
    and wt.created_at >= _from_date::timestamp with time zone;

  return greatest(0, v_balance - v_transaction_sum);
end;
$$;

revoke all on function private.get_wallet_interest_initial_balance(
  uuid,
  uuid,
  uuid,
  date
) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_wallet_interest_initial_balance(
  uuid,
  uuid,
  uuid,
  date
) to service_role;

comment on function private.get_wallet_interest_initial_balance(
  uuid,
  uuid,
  uuid,
  date
) is
  'Server-owned finance helper that derives the wallet interest starting balance from current wallet balance and later transactions in Postgres.';
