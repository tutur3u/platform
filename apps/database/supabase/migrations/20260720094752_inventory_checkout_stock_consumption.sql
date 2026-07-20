create table if not exists private.inventory_checkout_stock_consumptions (
  reservation_id uuid primary key
    references private.inventory_reservations(id) on delete cascade,
  checkout_session_id uuid not null
    references private.inventory_checkout_sessions(id) on delete cascade,
  checkout_line_id uuid not null
    references private.inventory_checkout_lines(id) on delete cascade,
  product_id uuid not null
    references public.workspace_products(id) on delete restrict,
  unit_id uuid not null
    references private.inventory_units(id) on delete restrict,
  warehouse_id uuid not null
    references private.inventory_warehouses(id) on delete restrict,
  requested_amount bigint not null check (requested_amount > 0),
  stock_before_amount bigint,
  stock_after_amount bigint,
  outcome text not null default 'pending' check (
    outcome in ('pending', 'decremented', 'unlimited', 'missing_stock')
  ),
  stock_change_id uuid
    references public.product_stock_changes(id) on delete set null,
  consumed_at timestamptz not null default now()
);

create index if not exists inventory_checkout_stock_consumptions_checkout_idx
  on private.inventory_checkout_stock_consumptions (checkout_session_id);

alter table private.inventory_checkout_stock_consumptions enable row level security;

revoke all on table private.inventory_checkout_stock_consumptions
  from public, anon, authenticated;
grant all on table private.inventory_checkout_stock_consumptions
  to service_role;

create or replace function private.consume_inventory_checkout_stock(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_now timestamptz default now()
) returns integer
language plpgsql
volatile
security definer
set search_path = private, public, pg_temp
as $$
declare
  reservation_row private.inventory_reservations%rowtype;
  stock_row private.inventory_products%rowtype;
  claimed_reservation_id uuid;
  operator_id uuid;
  new_stock_change_id uuid;
  stock_after bigint;
  stock_delta bigint;
  consumed_count integer := 0;
  checkout_token text;
  checkout_provider text;
begin
  select
    checkout.public_token,
    coalesce(
      checkout.checkout_provider,
      case when checkout.polar_order_id is not null then 'polar' end,
      'storefront'
    )
  into checkout_token, checkout_provider
  from private.inventory_checkout_sessions checkout
  where checkout.id = p_checkout_id
    and checkout.ws_id = p_ws_id;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select linked.virtual_user_id
  into operator_id
  from public.workspaces workspace
  join public.workspace_user_linked_users linked
    on linked.platform_user_id = workspace.creator_id
   and linked.ws_id = workspace.id
  where workspace.id = p_ws_id
  limit 1;

  if operator_id is null then
    select workspace_user.id
    into operator_id
    from public.workspace_users workspace_user
    where workspace_user.ws_id = p_ws_id
    order by workspace_user.created_at asc, workspace_user.id asc
    limit 1;
  end if;

  for reservation_row in
    select reservation.*
    from private.inventory_reservations reservation
    where reservation.checkout_session_id = p_checkout_id
      and reservation.status in ('reserved', 'consumed')
    order by reservation.created_at asc, reservation.id asc
    for update
  loop
    claimed_reservation_id := null;
    new_stock_change_id := null;

    insert into private.inventory_checkout_stock_consumptions (
      reservation_id,
      checkout_session_id,
      checkout_line_id,
      product_id,
      unit_id,
      warehouse_id,
      requested_amount,
      consumed_at
    ) values (
      reservation_row.id,
      reservation_row.checkout_session_id,
      reservation_row.checkout_line_id,
      reservation_row.product_id,
      reservation_row.unit_id,
      reservation_row.warehouse_id,
      reservation_row.amount,
      p_now
    )
    on conflict (reservation_id) do nothing
    returning reservation_id into claimed_reservation_id;

    if claimed_reservation_id is null then
      continue;
    end if;

    select stock.*
    into stock_row
    from private.inventory_products stock
    where stock.product_id = reservation_row.product_id
      and stock.unit_id = reservation_row.unit_id
      and stock.warehouse_id = reservation_row.warehouse_id
    for update;

    if not found then
      update private.inventory_checkout_stock_consumptions
      set outcome = 'missing_stock'
      where reservation_id = reservation_row.id;
      consumed_count := consumed_count + 1;
      continue;
    end if;

    if stock_row.amount is null then
      update private.inventory_checkout_stock_consumptions
      set
        outcome = 'unlimited',
        stock_before_amount = null,
        stock_after_amount = null
      where reservation_id = reservation_row.id;
      consumed_count := consumed_count + 1;
      continue;
    end if;

    stock_after := greatest(stock_row.amount - reservation_row.amount, 0);
    stock_delta := stock_after - stock_row.amount;

    update private.inventory_products
    set amount = stock_after
    where product_id = reservation_row.product_id
      and unit_id = reservation_row.unit_id
      and warehouse_id = reservation_row.warehouse_id;

    if stock_delta <> 0 and operator_id is not null then
      insert into public.product_stock_changes (
        product_id,
        unit_id,
        warehouse_id,
        amount,
        creator_id,
        note,
        created_at
      ) values (
        reservation_row.product_id,
        reservation_row.unit_id,
        reservation_row.warehouse_id,
        stock_delta,
        operator_id,
        format(
          'Storefront checkout %s completed via %s',
          checkout_token,
          checkout_provider
        ),
        p_now
      )
      returning id into new_stock_change_id;
    end if;

    update private.inventory_checkout_stock_consumptions
    set
      outcome = 'decremented',
      stock_before_amount = stock_row.amount,
      stock_after_amount = stock_after,
      stock_change_id = new_stock_change_id
    where reservation_id = reservation_row.id;

    consumed_count := consumed_count + 1;
  end loop;

  return consumed_count;
end;
$$;

revoke all on function private.consume_inventory_checkout_stock(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;
grant execute on function private.consume_inventory_checkout_stock(
  uuid,
  uuid,
  timestamptz
) to service_role;

create or replace function public.complete_inventory_checkout_session_payment(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_polar_order_id text,
  p_now timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
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
    perform private.consume_inventory_checkout_stock(
      checkout_row.id,
      checkout_row.ws_id,
      coalesce(checkout_row.completed_at, p_now)
    );
    return checkout_row.id;
  end if;

  if checkout_row.status <> 'reserved' then
    raise exception 'CHECKOUT_NOT_RESERVED'
      using errcode = 'P0001';
  end if;

  perform private.consume_inventory_checkout_stock(
    checkout_row.id,
    checkout_row.ws_id,
    p_now
  );

  update private.inventory_reservations
  set
    status = 'consumed',
    released_at = p_now
  where checkout_session_id = checkout_row.id
    and status = 'reserved';

  update private.inventory_checkout_sessions
  set
    status = 'completed',
    checkout_provider = coalesce(checkout_provider, 'polar'),
    polar_order_id = coalesce(nullif(p_polar_order_id, ''), polar_order_id),
    polar_status = 'paid',
    completed_at = p_now,
    updated_at = p_now
  where id = checkout_row.id
    and ws_id = checkout_row.ws_id;

  update private.inventory_settlement_ledger_entries
  set provider_ref = coalesce(nullif(p_polar_order_id, ''), provider_ref)
  where checkout_session_id = checkout_row.id
    and provider_ref is null;

  return checkout_row.id;
end;
$$;

create or replace function public.complete_inventory_checkout_session_square_payment(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_square_payment_id text,
  p_square_order_id text default null,
  p_now timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
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
    perform private.consume_inventory_checkout_stock(
      checkout_row.id,
      checkout_row.ws_id,
      coalesce(checkout_row.completed_at, p_now)
    );
    return checkout_row.id;
  end if;

  if checkout_row.status <> 'reserved' then
    raise exception 'CHECKOUT_NOT_RESERVED'
      using errcode = 'P0001';
  end if;

  perform private.consume_inventory_checkout_stock(
    checkout_row.id,
    checkout_row.ws_id,
    p_now
  );

  update private.inventory_reservations
  set
    status = 'consumed',
    released_at = p_now
  where checkout_session_id = checkout_row.id
    and status = 'reserved';

  update private.inventory_checkout_sessions
  set
    status = 'completed',
    checkout_provider = coalesce(checkout_provider, 'square_terminal'),
    square_payment_id = coalesce(nullif(p_square_payment_id, ''), square_payment_id),
    square_order_id = coalesce(nullif(p_square_order_id, ''), square_order_id),
    square_status = 'paid',
    square_last_synced_at = p_now,
    completed_at = p_now,
    updated_at = p_now
  where id = checkout_row.id
    and ws_id = checkout_row.ws_id;

  update private.inventory_settlement_ledger_entries
  set provider_ref = coalesce(
    nullif(p_square_payment_id, ''),
    nullif(p_square_order_id, ''),
    provider_ref
  )
  where checkout_session_id = checkout_row.id
    and provider_ref is null;

  return checkout_row.id;
end;
$$;

revoke all on function public.complete_inventory_checkout_session_payment(
  uuid,
  uuid,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_inventory_checkout_session_payment(
  uuid,
  uuid,
  text,
  timestamptz
) to service_role;

revoke all on function public.complete_inventory_checkout_session_square_payment(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_inventory_checkout_session_square_payment(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) to service_role;

create or replace function private.populate_inventory_listing_product_image()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if new.listing_type = 'product'
    and new.product_id is not null
    and new.image_url is null
  then
    select product.avatar_url
    into new.image_url
    from public.workspace_products product
    where product.id = new.product_id
      and product.ws_id = new.ws_id;
  end if;

  return new;
end;
$$;

drop trigger if exists populate_inventory_listing_product_image
  on private.inventory_storefront_listings;
create trigger populate_inventory_listing_product_image
before insert or update of listing_type, product_id, image_url
on private.inventory_storefront_listings
for each row execute function private.populate_inventory_listing_product_image();

create or replace function private.populate_inventory_listing_variant_image()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if new.product_id is not null and new.image_url is null then
    select product.avatar_url
    into new.image_url
    from public.workspace_products product
    where product.id = new.product_id
      and product.ws_id = new.ws_id;
  end if;

  return new;
end;
$$;

drop trigger if exists populate_inventory_listing_variant_image
  on private.inventory_storefront_listing_variants;
create trigger populate_inventory_listing_variant_image
before insert or update of product_id, image_url
on private.inventory_storefront_listing_variants
for each row execute function private.populate_inventory_listing_variant_image();

create or replace function private.sync_inventory_product_image_to_listings()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  update private.inventory_storefront_listings listing
  set
    image_url = new.avatar_url,
    updated_at = now()
  where listing.product_id = new.id
    and listing.ws_id = new.ws_id
    and (
      listing.image_url is null
      or listing.image_url is not distinct from old.avatar_url
    );

  update private.inventory_storefront_listing_variants variant
  set
    image_url = new.avatar_url,
    updated_at = now()
  where variant.product_id = new.id
    and variant.ws_id = new.ws_id
    and (
      variant.image_url is null
      or variant.image_url is not distinct from old.avatar_url
    );

  return new;
end;
$$;

drop trigger if exists sync_inventory_product_image_to_listings
  on public.workspace_products;
create trigger sync_inventory_product_image_to_listings
after update of avatar_url on public.workspace_products
for each row
when (old.avatar_url is distinct from new.avatar_url)
execute function private.sync_inventory_product_image_to_listings();

update private.inventory_storefront_listings listing
set
  image_url = product.avatar_url,
  updated_at = now()
from public.workspace_products product
where listing.product_id = product.id
  and listing.ws_id = product.ws_id
  and listing.image_url is null
  and product.avatar_url is not null;

update private.inventory_storefront_listing_variants variant
set
  image_url = product.avatar_url,
  updated_at = now()
from public.workspace_products product
where variant.product_id = product.id
  and variant.ws_id = product.ws_id
  and variant.image_url is null
  and product.avatar_url is not null;

do $$
declare
  completed_checkout record;
begin
  for completed_checkout in
    select checkout.id, checkout.ws_id, checkout.completed_at
    from private.inventory_checkout_sessions checkout
    where checkout.status = 'completed'
      and checkout.finance_invoice_id is null
      and (
        checkout.checkout_provider in ('polar', 'square_pos', 'square_terminal')
        or checkout.polar_order_id is not null
        or checkout.square_payment_id is not null
      )
      and exists (
        select 1
        from private.inventory_reservations reservation
        left join private.inventory_checkout_stock_consumptions consumption
          on consumption.reservation_id = reservation.id
        where reservation.checkout_session_id = checkout.id
          and reservation.status = 'consumed'
          and consumption.reservation_id is null
      )
  loop
    perform private.consume_inventory_checkout_stock(
      completed_checkout.id,
      completed_checkout.ws_id,
      coalesce(completed_checkout.completed_at, now())
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
