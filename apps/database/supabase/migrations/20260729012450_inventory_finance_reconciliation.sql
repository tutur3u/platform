-- Durable Inventory -> Finance reconciliation.
--
-- Provider-confirmed sales and corrections are first recorded as immutable
-- source entries. A source entry only affects Finance balances after it has a
-- currency-compatible wallet transaction. All posting and unlinking paths are
-- atomic database RPCs so webhook retries cannot create duplicate ledger rows.
create table private.inventory_finance_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (
    provider in ('polar', 'square_pos', 'square_terminal')
  ),
  currency text not null references private.currencies(code),
  wallet_id uuid references private.workspace_wallets(id) on delete set null,
  category_id uuid references public.transaction_categories(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ws_id, provider, currency),
  check (currency = upper(currency))
);
create table private.inventory_finance_entries (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  checkout_session_id uuid references private.inventory_checkout_sessions(id)
    on delete set null,
  parent_entry_id uuid references private.inventory_finance_entries(id)
    on delete set null,
  provider text not null check (
    provider in ('polar', 'square_pos', 'square_terminal')
  ),
  entry_kind text not null check (
    entry_kind in (
      'sale',
      'refund',
      'chargeback_hold',
      'chargeback_release',
      'manual_provider_adjustment'
    )
  ),
  source_key text not null,
  provider_reference_id text,
  amount_minor bigint not null check (amount_minor <> 0),
  amount numeric(30, 6) not null check (amount <> 0),
  currency text not null references private.currencies(code),
  occurred_at timestamptz not null,
  provider_status text not null default 'completed',
  reconciliation_status text not null default 'pending' check (
    reconciliation_status in ('pending', 'linked', 'error')
  ),
  suggested_category_id uuid references public.transaction_categories(id)
    on delete set null,
  wallet_transaction_id uuid unique
    references public.wallet_transactions(id) on delete set null,
  synchronization_error text,
  synchronization_attempts integer not null default 0 check (
    synchronization_attempts >= 0
  ),
  last_synchronized_at timestamptz,
  source_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ws_id, provider, source_key),
  check (currency = upper(currency)),
  check (
    (entry_kind in ('sale', 'chargeback_release') and amount_minor > 0)
    or (entry_kind in ('refund', 'chargeback_hold') and amount_minor < 0)
    or entry_kind = 'manual_provider_adjustment'
  )
);
create index inventory_finance_entries_workspace_inbox_idx on
  private.inventory_finance_entries (
    ws_id, reconciliation_status, occurred_at desc, id desc
  );
create index inventory_finance_entries_checkout_idx on
  private.inventory_finance_entries (checkout_session_id, entry_kind);
create index inventory_finance_entries_provider_reference_idx on
  private.inventory_finance_entries (
    ws_id, provider, provider_reference_id
  );
create index inventory_finance_entries_parent_idx on
  private.inventory_finance_entries (parent_entry_id);
create index inventory_finance_mappings_workspace_idx on
  private.inventory_finance_provider_mappings (ws_id, provider, currency);
alter table private.inventory_finance_provider_mappings enable row level security;
alter table private.inventory_finance_entries enable row level security;
revoke all on table private.inventory_finance_provider_mappings from
  public, anon, authenticated;
revoke all on table private.inventory_finance_entries from
  public, anon, authenticated;
grant all on table private.inventory_finance_provider_mappings to service_role;
grant all on table private.inventory_finance_entries to service_role;
create or replace function private.inventory_finance_minor_to_major(
  p_amount bigint,
  p_currency text
) returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select p_amount::numeric / case
    when upper(coalesce(p_currency, 'USD')) in (
      'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'
    ) then 1000
    when upper(coalesce(p_currency, 'USD')) in (
      'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA',
      'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
    ) then 1
    else 100
  end::numeric;
$$;
create or replace function private.ensure_inventory_finance_mapping_scope()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  new.currency := upper(trim(new.currency));
  if new.wallet_id is not null and not exists (
    select 1
    from private.workspace_wallets wallet
    where wallet.id = new.wallet_id
      and wallet.ws_id = new.ws_id
      and upper(wallet.currency) = new.currency
  ) then
    raise exception 'INVALID_INVENTORY_FINANCE_MAPPING_WALLET'
      using errcode = 'P0001';
  end if;
  if new.category_id is not null and not exists (
    select 1
    from public.transaction_categories category
    where category.id = new.category_id
      and category.ws_id = new.ws_id
  ) then
    raise exception 'INVALID_INVENTORY_FINANCE_MAPPING_CATEGORY'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger inventory_finance_mapping_scope
before insert or update of ws_id, currency, wallet_id, category_id
on private.inventory_finance_provider_mappings
for each row execute function private.ensure_inventory_finance_mapping_scope();
create trigger inventory_finance_mappings_updated_at
before update on private.inventory_finance_provider_mappings
for each row execute function public.update_updated_at_column();
create or replace function private.normalize_inventory_finance_entry()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  new.currency := upper(trim(new.currency));
  new.reconciliation_status := case
    when new.wallet_transaction_id is not null then 'linked'
    when nullif(trim(coalesce(new.synchronization_error, '')), '') is not null
      then 'error'
    else 'pending'
  end;
  if new.checkout_session_id is not null and not exists (
    select 1
    from private.inventory_checkout_sessions checkout
    where checkout.id = new.checkout_session_id
      and checkout.ws_id = new.ws_id
  ) then
    raise exception 'INVALID_INVENTORY_FINANCE_CHECKOUT_SCOPE'
      using errcode = 'P0001';
  end if;
  if new.parent_entry_id is not null and not exists (
    select 1
    from private.inventory_finance_entries parent
    where parent.id = new.parent_entry_id
      and parent.ws_id = new.ws_id
      and parent.provider = new.provider
  ) then
    raise exception 'INVALID_INVENTORY_FINANCE_PARENT_SCOPE'
      using errcode = 'P0001';
  end if;
  if new.suggested_category_id is not null and not exists (
    select 1
    from public.transaction_categories category
    where category.id = new.suggested_category_id
      and category.ws_id = new.ws_id
  ) then
    new.suggested_category_id := null;
  end if;
  return new;
end;
$$;
create trigger inventory_finance_entry_normalize
before insert or update
on private.inventory_finance_entries
for each row execute function private.normalize_inventory_finance_entry();
create trigger inventory_finance_entries_updated_at
before update on private.inventory_finance_entries
for each row execute function public.update_updated_at_column();
create or replace function private.sync_inventory_checkout_finance_link()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if new.entry_kind <> 'sale' or new.checkout_session_id is null then
    return new;
  end if;
  update private.inventory_checkout_sessions checkout
  set finance_transaction_id = new.wallet_transaction_id
  where checkout.id = new.checkout_session_id
    and checkout.ws_id = new.ws_id
    and (
      checkout.finance_transaction_id is null
      or checkout.finance_transaction_id = case
        when tg_op = 'UPDATE' then old.wallet_transaction_id
        else new.wallet_transaction_id
      end
    );
  return new;
end;
$$;
create trigger inventory_finance_entry_checkout_link
after insert or update of wallet_transaction_id
on private.inventory_finance_entries
for each row execute function private.sync_inventory_checkout_finance_link();
create or replace function private.upsert_inventory_finance_entry(
  p_ws_id uuid,
  p_checkout_session_id uuid,
  p_provider text,
  p_entry_kind text,
  p_source_key text,
  p_provider_reference_id text,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_at timestamptz,
  p_wallet_id uuid default null,
  p_category_id uuid default null,
  p_description text default null,
  p_provider_status text default 'completed',
  p_parent_entry_id uuid default null,
  p_source_metadata jsonb default '{}'::jsonb,
  p_synchronization_error text default null,
  p_link_if_possible boolean default true,
  p_actor_id uuid default null
) returns table (
  entry_id uuid,
  wallet_transaction_id uuid,
  reconciliation_status text,
  synchronization_error text
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  entry_row private.inventory_finance_entries%rowtype;
  wallet_row private.workspace_wallets%rowtype;
  category_valid boolean := false;
  resolved_error text := nullif(trim(coalesce(p_synchronization_error, '')), '');
  transaction_id uuid;
  normalized_currency text := upper(trim(p_currency));
begin
  if p_amount_minor = 0 then
    raise exception 'INVENTORY_FINANCE_AMOUNT_MUST_BE_NONZERO'
      using errcode = 'P0001';
  end if;
  if p_wallet_id is not null then
    select *
    into wallet_row
    from private.workspace_wallets wallet
    where wallet.id = p_wallet_id
      and wallet.ws_id = p_ws_id;
    if not found then
      resolved_error := 'wallet-not-found';
    elsif upper(wallet_row.currency) <> normalized_currency then
      resolved_error := 'wallet-currency-mismatch';
    end if;
  end if;
  if p_category_id is not null then
    select exists (
      select 1
      from public.transaction_categories category
      where category.id = p_category_id
        and category.ws_id = p_ws_id
    ) into category_valid;
  end if;
  insert into private.inventory_finance_entries (
    ws_id,
    checkout_session_id,
    parent_entry_id,
    provider,
    entry_kind,
    source_key,
    provider_reference_id,
    amount_minor,
    amount,
    currency,
    occurred_at,
    provider_status,
    suggested_category_id,
    synchronization_error,
    synchronization_attempts,
    last_synchronized_at,
    source_metadata,
    created_by,
    updated_by
  ) values (
    p_ws_id,
    p_checkout_session_id,
    p_parent_entry_id,
    p_provider,
    p_entry_kind,
    trim(p_source_key),
    nullif(trim(coalesce(p_provider_reference_id, '')), ''),
    p_amount_minor,
    private.inventory_finance_minor_to_major(
      p_amount_minor,
      normalized_currency
    ),
    normalized_currency,
    p_occurred_at,
    coalesce(nullif(trim(p_provider_status), ''), 'completed'),
    case when category_valid then p_category_id else null end,
    resolved_error,
    1,
    now(),
    coalesce(p_source_metadata, '{}'::jsonb),
    p_actor_id,
    p_actor_id
  )
  on conflict (ws_id, provider, source_key) do update
  set
    checkout_session_id = coalesce(
      excluded.checkout_session_id,
      inventory_finance_entries.checkout_session_id
    ),
    parent_entry_id = coalesce(
      excluded.parent_entry_id,
      inventory_finance_entries.parent_entry_id
    ),
    provider_reference_id = coalesce(
      excluded.provider_reference_id,
      inventory_finance_entries.provider_reference_id
    ),
    amount_minor = excluded.amount_minor,
    amount = excluded.amount,
    currency = excluded.currency,
    occurred_at = excluded.occurred_at,
    provider_status = excluded.provider_status,
    suggested_category_id = coalesce(
      excluded.suggested_category_id,
      inventory_finance_entries.suggested_category_id
    ),
    synchronization_error = excluded.synchronization_error,
    synchronization_attempts =
      inventory_finance_entries.synchronization_attempts + 1,
    last_synchronized_at = now(),
    source_metadata =
      inventory_finance_entries.source_metadata || excluded.source_metadata,
    updated_by = coalesce(excluded.updated_by, inventory_finance_entries.updated_by)
  returning * into entry_row;
  transaction_id := entry_row.wallet_transaction_id;
  if transaction_id is not null then
    update public.wallet_transactions
    set
      amount = entry_row.amount,
      taken_at = entry_row.occurred_at
    where id = transaction_id;
  elsif p_link_if_possible
    and p_wallet_id is not null
    and resolved_error is null then
    insert into public.wallet_transactions (
      amount,
      category_id,
      description,
      report_opt_in,
      taken_at,
      wallet_id,
      platform_creator_id
    ) values (
      entry_row.amount,
      case when category_valid then p_category_id else null end,
      coalesce(
        nullif(trim(coalesce(p_description, '')), ''),
        initcap(replace(entry_row.entry_kind, '_', ' '))
          || ' ' || coalesce(entry_row.provider_reference_id, entry_row.source_key)
      ),
      true,
      entry_row.occurred_at,
      p_wallet_id,
      p_actor_id
    )
    returning id into transaction_id;
    update private.inventory_finance_entries
    set
      wallet_transaction_id = transaction_id,
      synchronization_error = null,
      updated_by = coalesce(p_actor_id, updated_by)
    where id = entry_row.id
    returning * into entry_row;
  end if;
  return query
  select
    entry_row.id,
    entry_row.wallet_transaction_id,
    entry_row.reconciliation_status,
    entry_row.synchronization_error;
end;
$$;
create or replace function private.bulk_link_inventory_finance_entries(
  p_ws_id uuid,
  p_entry_ids uuid[],
  p_wallet_id uuid,
  p_category_id uuid default null,
  p_actor_id uuid default null
) returns table (linked_count integer, moved_count integer)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  entry_row private.inventory_finance_entries%rowtype;
  wallet_row private.workspace_wallets%rowtype;
  transaction_id uuid;
  linked_total integer := 0;
  moved_total integer := 0;
begin
  if coalesce(cardinality(p_entry_ids), 0) < 1
    or cardinality(p_entry_ids) > 100 then
    raise exception 'INVENTORY_FINANCE_BULK_LIMIT'
      using errcode = 'P0001';
  end if;
  select *
  into wallet_row
  from private.workspace_wallets wallet
  where wallet.id = p_wallet_id
    and wallet.ws_id = p_ws_id;
  if not found then
    raise exception 'INVALID_INVENTORY_FINANCE_WALLET'
      using errcode = 'P0001';
  end if;
  if p_category_id is not null and not exists (
    select 1
    from public.transaction_categories category
    where category.id = p_category_id
      and category.ws_id = p_ws_id
  ) then
    raise exception 'INVALID_INVENTORY_FINANCE_CATEGORY'
      using errcode = 'P0001';
  end if;
  if (
    select count(*)
    from private.inventory_finance_entries entry
    where entry.id = any(p_entry_ids)
      and entry.ws_id = p_ws_id
  ) <> cardinality(p_entry_ids) then
    raise exception 'INVALID_INVENTORY_FINANCE_ENTRY_SCOPE'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from private.inventory_finance_entries entry
    where entry.id = any(p_entry_ids)
      and upper(entry.currency) <> upper(wallet_row.currency)
  ) then
    raise exception 'INVENTORY_FINANCE_WALLET_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;
  for entry_row in
    select *
    from private.inventory_finance_entries entry
    where entry.id = any(p_entry_ids)
      and entry.ws_id = p_ws_id
    order by entry.id
    for update
  loop
    transaction_id := entry_row.wallet_transaction_id;
    if transaction_id is null then
      insert into public.wallet_transactions (
        amount,
        category_id,
        description,
        report_opt_in,
        taken_at,
        wallet_id,
        platform_creator_id
      ) values (
        entry_row.amount,
        coalesce(p_category_id, entry_row.suggested_category_id),
        initcap(replace(entry_row.entry_kind, '_', ' '))
          || ' ' || coalesce(
            entry_row.provider_reference_id,
            entry_row.source_key
          ),
        true,
        entry_row.occurred_at,
        p_wallet_id,
        p_actor_id
      )
      returning id into transaction_id;
      linked_total := linked_total + 1;
    else
      update public.wallet_transactions transaction
      set
        wallet_id = p_wallet_id,
        category_id = coalesce(
          p_category_id,
          transaction.category_id,
          entry_row.suggested_category_id
        )
      where transaction.id = transaction_id;
      moved_total := moved_total + 1;
    end if;
    update private.inventory_finance_entries
    set
      wallet_transaction_id = transaction_id,
      synchronization_error = null,
      updated_by = coalesce(p_actor_id, updated_by)
    where id = entry_row.id;
  end loop;
  return query select linked_total, moved_total;
end;
$$;
create or replace function private.bulk_unlink_inventory_finance_entries(
  p_ws_id uuid,
  p_entry_ids uuid[],
  p_actor_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  transaction_ids uuid[];
  affected integer;
begin
  if coalesce(cardinality(p_entry_ids), 0) < 1
    or cardinality(p_entry_ids) > 100 then
    raise exception 'INVENTORY_FINANCE_BULK_LIMIT'
      using errcode = 'P0001';
  end if;
  if (
    select count(*)
    from private.inventory_finance_entries entry
    where entry.id = any(p_entry_ids)
      and entry.ws_id = p_ws_id
  ) <> cardinality(p_entry_ids) then
    raise exception 'INVALID_INVENTORY_FINANCE_ENTRY_SCOPE'
      using errcode = 'P0001';
  end if;
  perform 1
  from private.inventory_finance_entries entry
  where entry.id = any(p_entry_ids)
    and entry.ws_id = p_ws_id
  for update;
  select array_agg(entry.wallet_transaction_id)
  into transaction_ids
  from private.inventory_finance_entries entry
  where entry.id = any(p_entry_ids)
    and entry.ws_id = p_ws_id
    and entry.wallet_transaction_id is not null;
  update private.inventory_finance_entries
  set
    wallet_transaction_id = null,
    synchronization_error = null,
    updated_by = coalesce(p_actor_id, updated_by)
  where id = any(p_entry_ids)
    and ws_id = p_ws_id;
  get diagnostics affected = row_count;
  if coalesce(cardinality(transaction_ids), 0) > 0 then
    delete from public.wallet_transactions
    where id = any(transaction_ids);
  end if;
  return affected;
end;
$$;
revoke all on function private.inventory_finance_minor_to_major(bigint, text) from
  public, anon, authenticated;
revoke all on function private.upsert_inventory_finance_entry(
  uuid, uuid, text, text, text, text, bigint, text, timestamptz,
  uuid, uuid, text, text, uuid, jsonb, text, boolean, uuid
) from public, anon, authenticated;
revoke all on function private.bulk_link_inventory_finance_entries(
  uuid, uuid[], uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function private.bulk_unlink_inventory_finance_entries(
  uuid, uuid[], uuid
) from public, anon, authenticated;
grant execute on function private.inventory_finance_minor_to_major(bigint, text) to
  service_role;
grant execute on function private.upsert_inventory_finance_entry(
  uuid, uuid, text, text, text, text, bigint, text, timestamptz,
  uuid, uuid, text, text, uuid, jsonb, text, boolean, uuid
) to service_role;
grant execute on function private.bulk_link_inventory_finance_entries(
  uuid, uuid[], uuid, uuid, uuid
) to service_role;
grant execute on function private.bulk_unlink_inventory_finance_entries(
  uuid, uuid[], uuid
) to service_role;
-- Historical completed real-provider checkouts are visible in the inbox.
-- Existing Finance links are preserved, while unmatched sales stay pending and
-- do not create ledger rows during the migration.
insert into private.inventory_finance_entries (
  ws_id,
  checkout_session_id,
  provider,
  entry_kind,
  source_key,
  provider_reference_id,
  amount_minor,
  amount,
  currency,
  occurred_at,
  provider_status,
  reconciliation_status,
  wallet_transaction_id,
  source_metadata
)
select
  checkout.ws_id,
  checkout.id,
  provider.value,
  'sale',
  'sale:' || coalesce(
    checkout.polar_order_id,
    checkout.square_payment_id,
    checkout.square_order_id,
    checkout.id::text
  ),
  coalesce(
    checkout.polar_order_id,
    checkout.square_payment_id,
    checkout.square_order_id,
    checkout.id::text
  ),
  checkout.total_amount,
  private.inventory_finance_minor_to_major(
    checkout.total_amount,
    checkout.currency
  ),
  upper(checkout.currency),
  coalesce(checkout.completed_at, checkout.updated_at, checkout.created_at, now()),
  'completed',
  case
    when checkout.finance_transaction_id is null then 'pending'
    else 'linked'
  end,
  checkout.finance_transaction_id,
  jsonb_build_object(
    'checkoutId', checkout.id,
    'customerName', checkout.customer_name,
    'customerEmail', checkout.customer_email
  )
from private.inventory_checkout_sessions checkout
cross join lateral (
  select case
    when checkout.checkout_provider in (
      'polar',
      'square_pos',
      'square_terminal'
    ) then checkout.checkout_provider
    when checkout.polar_order_id is not null then 'polar'
    when checkout.square_payment_id is not null then 'square_terminal'
    else null
  end as value
) provider
where checkout.status = 'completed'
  and checkout.total_amount > 0
  and provider.value is not null
on conflict (ws_id, provider, source_key) do nothing;
