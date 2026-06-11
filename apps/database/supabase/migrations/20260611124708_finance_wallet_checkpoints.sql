create schema if not exists private;

grant usage on schema private to service_role;

create table private.workspace_wallet_checkpoints (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null
    references private.workspace_wallets(id)
    on update cascade
    on delete cascade,
  checked_at timestamp with time zone not null default now(),
  actual_balance numeric not null,
  ledger_balance numeric not null,
  currency text not null references private.currencies(code),
  note text,
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint workspace_wallet_checkpoints_note_length_check
    check (note is null or char_length(note) <= 500),
  constraint workspace_wallet_checkpoints_wallet_checked_at_key
    unique (wallet_id, checked_at)
);

create index workspace_wallet_checkpoints_wallet_checked_at_desc_idx
  on private.workspace_wallet_checkpoints (wallet_id, checked_at desc, id desc);

create index workspace_wallet_checkpoints_created_by_idx
  on private.workspace_wallet_checkpoints (created_by)
  where created_by is not null;

revoke all on table private.workspace_wallet_checkpoints
from public, anon, authenticated;

grant all on table private.workspace_wallet_checkpoints to service_role;

alter table private.workspace_wallet_checkpoints enable row level security;

drop policy if exists "Service role can manage private workspace wallet checkpoints"
  on private.workspace_wallet_checkpoints;

create policy "Service role can manage private workspace wallet checkpoints"
  on private.workspace_wallet_checkpoints
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists workspace_wallet_checkpoints_updated_at
  on private.workspace_wallet_checkpoints;

create trigger workspace_wallet_checkpoints_updated_at
  before update on private.workspace_wallet_checkpoints
  for each row
  execute function public.update_updated_at_column();

do $$
begin
  if to_regprocedure('audit.enable_tracking(regclass)') is not null then
    perform audit.enable_tracking('private.workspace_wallet_checkpoints'::regclass);
  end if;
end;
$$;

create or replace function private.get_wallet_ledger_balance_at(
  _wallet_id uuid,
  _checked_at timestamp with time zone
)
returns numeric
language sql
security definer
stable
set search_path = private, public, pg_temp
as $$
  select
    coalesce(ww.balance, 0)::numeric
    - coalesce((
      select sum(wt.amount)::numeric
      from public.wallet_transactions wt
      where wt.wallet_id = _wallet_id
        and wt.taken_at > _checked_at
    ), 0)
  from private.workspace_wallets ww
  where ww.id = _wallet_id
$$;

create or replace function private.get_wallet_checkpoint_interval_delta(
  _wallet_id uuid,
  _start_at timestamp with time zone,
  _end_at timestamp with time zone
)
returns table (
  ledger_delta numeric,
  transaction_count bigint
)
language sql
security definer
stable
set search_path = private, public, pg_temp
as $$
  select
    coalesce(sum(wt.amount), 0)::numeric as ledger_delta,
    count(wt.id)::bigint as transaction_count
  from public.wallet_transactions wt
  where wt.wallet_id = _wallet_id
    and wt.taken_at > _start_at
    and wt.taken_at <= _end_at
$$;

create or replace function private.list_wallet_checkpoint_intervals(
  _wallet_id uuid,
  _limit integer default 50
)
returns table (
  start_checkpoint_id uuid,
  end_checkpoint_id uuid,
  start_checked_at timestamp with time zone,
  end_checked_at timestamp with time zone,
  start_actual_balance numeric,
  end_actual_balance numeric,
  actual_delta numeric,
  ledger_delta numeric,
  interval_variance numeric,
  transaction_count bigint
)
language sql
security definer
stable
set search_path = private, public, pg_temp
as $$
  with ordered_checkpoints as (
    select
      wcp.id,
      wcp.checked_at,
      wcp.actual_balance,
      lag(wcp.id) over checkpoint_order as previous_id,
      lag(wcp.checked_at) over checkpoint_order as previous_checked_at,
      lag(wcp.actual_balance) over checkpoint_order as previous_actual_balance
    from private.workspace_wallet_checkpoints wcp
    where wcp.wallet_id = _wallet_id
    window checkpoint_order as (
      order by wcp.checked_at asc, wcp.created_at asc, wcp.id asc
    )
  ),
  interval_rows as (
    select
      oc.previous_id as start_checkpoint_id,
      oc.id as end_checkpoint_id,
      oc.previous_checked_at as start_checked_at,
      oc.checked_at as end_checked_at,
      oc.previous_actual_balance as start_actual_balance,
      oc.actual_balance as end_actual_balance,
      (oc.actual_balance - oc.previous_actual_balance)::numeric as actual_delta,
      coalesce((
        select sum(wt.amount)::numeric
        from public.wallet_transactions wt
        where wt.wallet_id = _wallet_id
          and wt.taken_at > oc.previous_checked_at
          and wt.taken_at <= oc.checked_at
      ), 0) as ledger_delta,
      (
        select count(wt.id)::bigint
        from public.wallet_transactions wt
        where wt.wallet_id = _wallet_id
          and wt.taken_at > oc.previous_checked_at
          and wt.taken_at <= oc.checked_at
      ) as transaction_count
    from ordered_checkpoints oc
    where oc.previous_id is not null
      and oc.previous_checked_at is not null
      and oc.previous_actual_balance is not null
  )
  select
    ir.start_checkpoint_id,
    ir.end_checkpoint_id,
    ir.start_checked_at,
    ir.end_checked_at,
    ir.start_actual_balance,
    ir.end_actual_balance,
    ir.actual_delta,
    ir.ledger_delta,
    (ir.actual_delta - ir.ledger_delta)::numeric as interval_variance,
    ir.transaction_count
  from interval_rows ir
  order by ir.end_checked_at desc, ir.end_checkpoint_id desc
  limit greatest(0, least(coalesce(_limit, 50), 200))
$$;

create or replace function private.create_workspace_wallet_checkpoints_batch(
  _ws_id uuid,
  _actor_id uuid,
  _checked_at timestamp with time zone,
  _entries jsonb
)
returns setof private.workspace_wallet_checkpoints
language plpgsql
security definer
volatile
set search_path = private, public, pg_temp
as $$
declare
  v_checked_at timestamp with time zone := coalesce(_checked_at, now());
  v_entry jsonb;
  v_entry_count integer;
  v_distinct_wallet_count integer;
  v_wallet record;
  v_wallet_id uuid;
begin
  if _entries is null or jsonb_typeof(_entries) <> 'array' then
    raise exception 'checkpoint entries must be an array'
      using errcode = '22023';
  end if;

  select count(*), count(distinct entry ->> 'wallet_id')
  into v_entry_count, v_distinct_wallet_count
  from jsonb_array_elements(_entries) as entry;

  if v_entry_count = 0 then
    raise exception 'checkpoint entries cannot be empty'
      using errcode = '22023';
  end if;

  if v_entry_count <> v_distinct_wallet_count then
    raise exception 'duplicate wallet checkpoint entries are not allowed'
      using errcode = '23505';
  end if;

  for v_entry in
    select entry
    from jsonb_array_elements(_entries) as entry
  loop
    v_wallet_id := (v_entry ->> 'wallet_id')::uuid;

    select ww.id, ww.currency
    into v_wallet
    from private.workspace_wallets ww
    where ww.id = v_wallet_id
      and ww.ws_id = _ws_id;

    if not found then
      raise exception 'wallet % not found in workspace %', v_wallet_id, _ws_id
        using errcode = 'P0002';
    end if;

    return query
    insert into private.workspace_wallet_checkpoints (
      wallet_id,
      checked_at,
      actual_balance,
      ledger_balance,
      currency,
      note,
      created_by
    )
    values (
      v_wallet.id,
      v_checked_at,
      (v_entry ->> 'actual_balance')::numeric,
      private.get_wallet_ledger_balance_at(v_wallet.id, v_checked_at),
      v_wallet.currency,
      nullif(v_entry ->> 'note', ''),
      _actor_id
    )
    returning *;
  end loop;
end;
$$;

revoke all on function private.get_wallet_ledger_balance_at(
  uuid,
  timestamp with time zone
) from public, anon, authenticated;

revoke all on function private.get_wallet_checkpoint_interval_delta(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) from public, anon, authenticated;

revoke all on function private.list_wallet_checkpoint_intervals(
  uuid,
  integer
) from public, anon, authenticated;

revoke all on function private.create_workspace_wallet_checkpoints_batch(
  uuid,
  uuid,
  timestamp with time zone,
  jsonb
) from public, anon, authenticated;

grant execute on function private.get_wallet_ledger_balance_at(
  uuid,
  timestamp with time zone
) to service_role;

grant execute on function private.get_wallet_checkpoint_interval_delta(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) to service_role;

grant execute on function private.list_wallet_checkpoint_intervals(
  uuid,
  integer
) to service_role;

grant execute on function private.create_workspace_wallet_checkpoints_batch(
  uuid,
  uuid,
  timestamp with time zone,
  jsonb
) to service_role;

comment on table private.workspace_wallet_checkpoints is
  'Audit checkpoints that store the actual wallet balance observed by a user and the ledger balance calculated at the same timestamp.';

comment on function private.get_wallet_ledger_balance_at(
  uuid,
  timestamp with time zone
) is
  'Returns the ledger balance for one wallet at an exact checkpoint timestamp by reversing later transactions from the current stored wallet balance.';

comment on function private.list_wallet_checkpoint_intervals(uuid, integer) is
  'Returns adjacent checkpoint reconciliation windows for one wallet with exact actual delta, ledger delta, and variance.';

comment on function private.create_workspace_wallet_checkpoints_batch(
  uuid,
  uuid,
  timestamp with time zone,
  jsonb
) is
  'Creates multiple wallet checkpoints atomically for an all-wallet audit check, calculating each ledger balance inside Postgres.';
