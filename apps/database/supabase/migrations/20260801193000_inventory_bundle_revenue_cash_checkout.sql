-- Preserve provider-facing checkout prices while recognizing fixed-bundle
-- revenue proportionally across the stock rows that were actually consumed.

alter table private.inventory_checkout_lines
  add column if not exists catalog_basis_amount bigint,
  add column if not exists recognized_revenue_amount bigint,
  add column if not exists revenue_allocation_source text;

update private.inventory_checkout_lines
set
  catalog_basis_amount = coalesce(catalog_basis_amount, subtotal_amount),
  recognized_revenue_amount = coalesce(
    recognized_revenue_amount,
    subtotal_amount
  ),
  revenue_allocation_source = coalesce(
    revenue_allocation_source,
    'legacy_charged'
  );

alter table private.inventory_checkout_lines
  alter column catalog_basis_amount set default 0,
  alter column catalog_basis_amount set not null,
  alter column recognized_revenue_amount set default 0,
  alter column recognized_revenue_amount set not null,
  alter column revenue_allocation_source set default 'direct',
  alter column revenue_allocation_source set not null,
  add constraint inventory_checkout_lines_catalog_basis_nonnegative
    check (catalog_basis_amount >= 0),
  add constraint inventory_checkout_lines_recognized_revenue_nonnegative
    check (recognized_revenue_amount >= 0),
  add constraint inventory_checkout_lines_revenue_allocation_source_check
    check (
      revenue_allocation_source in (
        'direct',
        'stock_snapshot',
        'current_stock_backfill',
        'equal_weight_fallback',
        'legacy_charged'
      )
    );

create or replace function private.initialize_inventory_checkout_line_revenue()
returns trigger
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
  if new.catalog_basis_amount = 0 and new.subtotal_amount > 0 then
    new.catalog_basis_amount := new.subtotal_amount;
  end if;
  if new.recognized_revenue_amount = 0 and new.subtotal_amount > 0 then
    new.recognized_revenue_amount := new.subtotal_amount;
  end if;
  if new.bundle_id is null then
    new.revenue_allocation_source := 'direct';
  elsif new.revenue_allocation_source = 'direct' then
    new.revenue_allocation_source := 'legacy_charged';
  end if;
  return new;
end;
$$;

drop trigger if exists initialize_inventory_checkout_line_revenue
on private.inventory_checkout_lines;
create trigger initialize_inventory_checkout_line_revenue
before insert on private.inventory_checkout_lines
for each row execute function private.initialize_inventory_checkout_line_revenue();

create or replace function private.allocate_inventory_checkout_revenue(
  p_checkout_id uuid,
  p_proportional_source text default 'stock_snapshot'
) returns bigint
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
  bundle_group record;
  recognized_total bigint;
begin
  if p_proportional_source not in (
    'stock_snapshot',
    'current_stock_backfill'
  ) then
    raise exception 'INVALID_REVENUE_ALLOCATION_SOURCE'
      using errcode = 'P0001';
  end if;

  select *
  into checkout_row
  from private.inventory_checkout_sessions
  where id = p_checkout_id
  for update;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  update private.inventory_checkout_lines line
  set
    catalog_basis_amount = coalesce(
      (
        select private.inventory_major_to_minor(stock.price, checkout_row.currency)
          * line.quantity
        from private.inventory_products stock
        where stock.product_id = line.product_id
          and stock.unit_id = line.unit_id
          and stock.warehouse_id = line.warehouse_id
        limit 1
      ),
      line.subtotal_amount
    ),
    recognized_revenue_amount = line.subtotal_amount,
    revenue_allocation_source = case
      when line.bundle_id is null then 'direct'
      else 'legacy_charged'
    end
  where line.checkout_session_id = checkout_row.id;

  for bundle_group in
    select
      line.bundle_id,
      line.listing_id,
      sum(line.subtotal_amount)::bigint as target_amount,
      sum(line.catalog_basis_amount)::bigint as basis_amount,
      sum(line.quantity)::bigint as consumed_units
    from private.inventory_checkout_lines line
    join private.inventory_bundles bundle
      on bundle.id = line.bundle_id
     and bundle.pricing_mode = 'fixed_price'
    where line.checkout_session_id = checkout_row.id
    group by line.bundle_id, line.listing_id
    having bool_and(exists (
      select 1
      from private.inventory_products stock
      where stock.product_id = line.product_id
        and stock.unit_id = line.unit_id
        and stock.warehouse_id = line.warehouse_id
    ))
  loop
    with weighted as (
      select
        line.id,
        case
          when bundle_group.basis_amount > 0
            then line.catalog_basis_amount
          else line.quantity
        end::numeric as weight,
        case
          when bundle_group.basis_amount > 0
            then bundle_group.basis_amount
          else bundle_group.consumed_units
        end::numeric as total_weight
      from private.inventory_checkout_lines line
      where line.checkout_session_id = checkout_row.id
        and line.bundle_id = bundle_group.bundle_id
        and line.listing_id is not distinct from bundle_group.listing_id
    ), raw_allocations as (
      select
        id,
        bundle_group.target_amount::numeric * weight / total_weight as raw_amount
      from weighted
    ), floored as (
      select
        id,
        floor(raw_amount)::bigint as floor_amount,
        raw_amount - floor(raw_amount) as fractional_remainder
      from raw_allocations
    ), remainder as (
      select
        bundle_group.target_amount - sum(floor_amount)::bigint as amount
      from floored
    ), ranked as (
      select
        floored.*,
        row_number() over (
          order by fractional_remainder desc, id asc
        ) as remainder_rank
      from floored
    )
    update private.inventory_checkout_lines line
    set
      recognized_revenue_amount = ranked.floor_amount + case
        when ranked.remainder_rank <= remainder.amount then 1
        else 0
      end,
      revenue_allocation_source = case
        when bundle_group.basis_amount > 0 then p_proportional_source
        else 'equal_weight_fallback'
      end
    from ranked cross join remainder
    where line.id = ranked.id;

    if (
      select coalesce(sum(line.recognized_revenue_amount), 0)
      from private.inventory_checkout_lines line
      where line.checkout_session_id = checkout_row.id
        and line.bundle_id = bundle_group.bundle_id
        and line.listing_id is not distinct from bundle_group.listing_id
    ) <> bundle_group.target_amount then
      raise exception 'BUNDLE_REVENUE_ALLOCATION_MISMATCH'
        using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(sum(line.recognized_revenue_amount), 0)
  into recognized_total
  from private.inventory_checkout_lines line
  where line.checkout_session_id = checkout_row.id;

  if recognized_total <> checkout_row.subtotal_amount then
    raise exception 'CHECKOUT_REVENUE_ALLOCATION_MISMATCH'
      using errcode = 'P0001';
  end if;

  return recognized_total;
end;
$$;

revoke all on function private.allocate_inventory_checkout_revenue(
  uuid,
  text
) from public, anon, authenticated;
grant execute on function private.allocate_inventory_checkout_revenue(
  uuid,
  text
) to service_role;

create or replace function private.allocate_inventory_checkout_revenue_trigger()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  perform private.allocate_inventory_checkout_revenue(new.id, 'stock_snapshot');
  return new;
end;
$$;

drop trigger if exists inventory_checkout_revenue_allocation
on private.inventory_checkout_sessions;
create trigger inventory_checkout_revenue_allocation
after update of subtotal_amount on private.inventory_checkout_sessions
for each row
when (new.status = 'reserved')
execute function private.allocate_inventory_checkout_revenue_trigger();

-- Existing completed/reserved checkouts get a best-effort proportional
-- reconstruction using current stock prices. Missing/deleted bundle identity
-- retains the initialized charged layout and therefore still balances.
do $$
declare
  checkout_id uuid;
begin
  for checkout_id in
    select distinct checkout.id
    from private.inventory_checkout_sessions checkout
    join private.inventory_checkout_lines line
      on line.checkout_session_id = checkout.id
    join private.inventory_bundles bundle
      on bundle.id = line.bundle_id
     and bundle.pricing_mode = 'fixed_price'
    where checkout.status in ('reserved', 'completed')
  loop
    perform private.allocate_inventory_checkout_revenue(
      checkout_id,
      'current_stock_backfill'
    );
  end loop;
end;
$$;

-- Cash is a staff-confirmed checkout provider. It is deliberately absent from
-- provider mappings because every cash completion supplies an explicit wallet
-- and category.
alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_checkout_mode_check;
alter table private.inventory_storefronts
  add constraint inventory_storefronts_checkout_mode_check
  check (
    checkout_mode in (
      'cash',
      'polar',
      'square_pos',
      'square_terminal',
      'simulated',
      'disabled'
    )
  );

alter table private.inventory_checkout_sessions
  drop constraint if exists inventory_checkout_sessions_checkout_provider_check;
alter table private.inventory_checkout_sessions
  add constraint inventory_checkout_sessions_checkout_provider_check
  check (
    checkout_provider is null
    or checkout_provider in (
      'cash',
      'polar',
      'square_pos',
      'square_terminal',
      'simulated',
      'disabled'
    )
  ),
  add column if not exists cash_wallet_id uuid
    references private.workspace_wallets(id) on delete set null,
  add column if not exists cash_category_id uuid
    references public.transaction_categories(id) on delete set null,
  add column if not exists cash_collected_by uuid
    references auth.users(id) on delete set null;

alter table private.inventory_finance_entries
  drop constraint if exists inventory_finance_entries_provider_check;
alter table private.inventory_finance_entries
  add constraint inventory_finance_entries_provider_check
  check (provider in ('cash', 'polar', 'square_pos', 'square_terminal'));

create or replace function private.complete_inventory_checkout_session_cash_payment(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_wallet_id uuid,
  p_category_id uuid,
  p_actor_id uuid,
  p_now timestamptz default now()
) returns table (
  checkout_id uuid,
  finance_entry_id uuid,
  wallet_transaction_id uuid
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
  finance_row record;
begin
  select *
  into checkout_row
  from private.inventory_checkout_sessions
  where id = p_checkout_id
    and ws_id = p_ws_id
  for update;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if checkout_row.status = 'completed' then
    if checkout_row.checkout_provider <> 'cash'
      or checkout_row.cash_wallet_id is distinct from p_wallet_id
      or checkout_row.cash_category_id is distinct from p_category_id then
      raise exception 'CASH_CHECKOUT_RETRY_MISMATCH'
        using errcode = 'P0001';
    end if;
    select
      entry.id as entry_id,
      entry.wallet_transaction_id
    into finance_row
    from private.inventory_finance_entries entry
    where entry.ws_id = checkout_row.ws_id
      and entry.checkout_session_id = checkout_row.id
      and entry.provider = 'cash'
      and entry.source_key = 'sale:' || checkout_row.id::text;

    if not found or finance_row.wallet_transaction_id is null then
      raise exception 'CASH_FINANCE_LINK_FAILED'
        using errcode = 'P0001';
    end if;

    return query select
      checkout_row.id,
      finance_row.entry_id,
      finance_row.wallet_transaction_id;
    return;
  elsif checkout_row.status <> 'reserved' then
    raise exception 'CHECKOUT_NOT_RESERVED'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from private.workspace_wallets wallet
    where wallet.id = p_wallet_id
      and wallet.ws_id = checkout_row.ws_id
      and upper(wallet.currency) = upper(checkout_row.currency)
  ) then
    raise exception 'CASH_WALLET_INVALID'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.transaction_categories category
    where category.id = p_category_id
      and category.ws_id = checkout_row.ws_id
  ) then
    raise exception 'CASH_CATEGORY_INVALID'
      using errcode = 'P0001';
  end if;

  perform private.allocate_inventory_checkout_revenue(
    checkout_row.id,
    'stock_snapshot'
  );

  if checkout_row.status = 'reserved' then
    perform private.consume_inventory_checkout_stock(
      checkout_row.id,
      checkout_row.ws_id,
      p_now
    );

    update private.inventory_reservations
    set status = 'consumed', released_at = p_now
    where checkout_session_id = checkout_row.id
      and status = 'reserved';

    update private.inventory_checkout_sessions
    set
      status = 'completed',
      checkout_provider = 'cash',
      cash_wallet_id = p_wallet_id,
      cash_category_id = p_category_id,
      cash_collected_by = p_actor_id,
      completed_at = p_now,
      updated_at = p_now
    where id = checkout_row.id;
  end if;

  select *
  into finance_row
  from private.upsert_inventory_finance_entry(
    p_ws_id := checkout_row.ws_id,
    p_checkout_session_id := checkout_row.id,
    p_provider := 'cash',
    p_entry_kind := 'sale',
    p_source_key := 'sale:' || checkout_row.id::text,
    p_provider_reference_id := checkout_row.id::text,
    p_amount_minor := checkout_row.total_amount,
    p_currency := checkout_row.currency,
    p_occurred_at := coalesce(checkout_row.completed_at, p_now),
    p_wallet_id := p_wallet_id,
    p_category_id := p_category_id,
    p_description := 'Cash storefront sale ' || checkout_row.public_token,
    p_provider_status := 'completed',
    p_source_metadata := jsonb_build_object(
      'cashierId', p_actor_id,
      'publicToken', checkout_row.public_token
    ),
    p_link_if_possible := true,
    p_actor_id := p_actor_id
  );

  if finance_row.wallet_transaction_id is null then
    raise exception 'CASH_FINANCE_LINK_FAILED'
      using errcode = 'P0001';
  end if;

  return query select
    checkout_row.id,
    finance_row.entry_id,
    finance_row.wallet_transaction_id;
end;
$$;

revoke all on function private.complete_inventory_checkout_session_cash_payment(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;
grant execute on function private.complete_inventory_checkout_session_cash_payment(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) to service_role;

notify pgrst, 'reload schema';
