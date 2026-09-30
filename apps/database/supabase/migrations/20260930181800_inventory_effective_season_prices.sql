-- Additive, opt-in. No existing prices, quantities or invoices are rewritten.
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

alter table private.inventory_sales_periods
  add column pricing_mode text not null default 'legacy'
    check (pricing_mode in ('legacy', 'scheduled')),
  add column time_zone text,
  add constraint inventory_scheduled_period_dates check (
    pricing_mode = 'legacy' or
    (time_zone is not null and starts_at is not null and ends_at is not null)
  );

create table private.inventory_product_prices (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  period_id uuid not null,
  product_id uuid not null,
  unit_id uuid not null,
  warehouse_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price numeric(30,6) not null check (price >= 0 and price <> 'NaN'::numeric),
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (valid_to is null or valid_to > valid_from),
  foreign key (period_id, ws_id)
    references private.inventory_sales_periods(id, ws_id),
  foreign key (product_id) references public.workspace_products(id),
  foreign key (unit_id) references private.inventory_units(id),
  foreign key (warehouse_id) references private.inventory_warehouses(id),
  exclude using gist (
    period_id with =, product_id with =, unit_id with =, warehouse_id with =,
    tstzrange(valid_from, valid_to, '[)') with &&
  )
);

create index inventory_product_prices_workspace_period
  on private.inventory_product_prices(ws_id, period_id);

-- Immutable provenance; invoice lines continue to own their captured amounts.
create table private.inventory_sale_price_snapshots (
  invoice_id uuid primary key, -- Durable receipt/tombstone survives invoice deletion and recovery.
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  period_id uuid not null,
  period_name text not null,
  currency text not null,
  captured_at timestamptz not null,
  lines jsonb not null,
  request_payload jsonb not null,
  unique(ws_id, request_id)
);

-- Bound provenance checks to the selected period before expanding invoice lines.
create index inventory_sale_price_snapshots_period_captured
  on private.inventory_sale_price_snapshots(period_id, captured_at);

alter table private.inventory_product_prices enable row level security;
alter table private.inventory_sale_price_snapshots enable row level security;
create policy "Service role manages effective inventory prices"
  on private.inventory_product_prices for all to service_role
  using (true) with check (true);
create policy "Service role manages inventory price snapshots"
  on private.inventory_sale_price_snapshots for all to service_role
  using (true) with check (true);
revoke all on private.inventory_product_prices, private.inventory_sale_price_snapshots
  from public, anon, authenticated;
grant all on private.inventory_product_prices, private.inventory_sale_price_snapshots
  to service_role;

-- Period edits, rule edits, price authoring and checkout take the same parent lock.
create function private.lock_inventory_pricing_period()
returns trigger language plpgsql set search_path = pg_catalog, private, public as $$
declare
  v_period uuid;
  v_ws uuid;
begin
  if tg_op = 'DELETE' then
    v_period := old.period_id; v_ws := old.ws_id;
  else
    v_period := new.period_id; v_ws := new.ws_id;
  end if;
  perform 1 from private.inventory_sales_periods
    where id = v_period and ws_id = v_ws for update;
  if tg_op <> 'DELETE' and not exists (
    select 1 from public.workspace_products p where p.id = new.product_id and p.ws_id = v_ws
  ) then
    raise exception 'Invalid price workspace' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'inventory_product_prices' then
    if (new.id, new.ws_id, new.period_id, new.product_id, new.unit_id, new.warehouse_id,
      new.currency, new.price, new.valid_from) is distinct from
      (old.id, old.ws_id, old.period_id, old.product_id, old.unit_id, old.warehouse_id,
      old.currency, old.price, old.valid_from) then
      raise exception 'Append a price interval instead of overwriting history' using errcode = '23514';
    end if;
    if new.valid_to is not null and exists (
      select 1 from private.inventory_sale_price_snapshots s, jsonb_array_elements(s.lines) l
      where s.period_id = new.period_id and s.captured_at >= new.valid_to and l->>'price_id' = new.id::text
    ) then
      raise exception 'Cannot truncate a price across completed sales' using errcode = '23514';
    end if;
  end if;
  if tg_op <> 'DELETE' and tg_table_name = 'inventory_product_prices' then
    if not exists (select 1 from private.inventory_units where id = new.unit_id and ws_id = v_ws) or
      not exists (select 1 from private.inventory_warehouses where id = new.warehouse_id and ws_id = v_ws) then
      raise exception 'Invalid price stock workspace' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger inventory_price_scope_lock before insert or update or delete
  on private.inventory_product_prices for each row
  execute function private.lock_inventory_pricing_period();
create trigger inventory_period_rule_lock before insert or update or delete
  on private.inventory_sales_period_products for each row
  execute function private.lock_inventory_pricing_period();

create function private.validate_inventory_pricing_period()
returns trigger language plpgsql set search_path = pg_catalog, private, public as $$
begin
  if new.time_zone is not null and not exists (
    select 1 from pg_timezone_names where name = new.time_zone
  ) then
    raise exception 'Invalid IANA time zone' using errcode = '23514';
  end if;
  -- Changing timezone/date/mode after prices exist would reinterpret history.
  if tg_op = 'UPDATE' and
    (new.time_zone, new.starts_at, new.ends_at, new.pricing_mode) is distinct from
    (old.time_zone, old.starts_at, old.ends_at, old.pricing_mode) and exists (
      select 1 from private.inventory_product_prices where period_id = old.id
    ) then
    raise exception 'Priced period dates, timezone and mode are immutable; create another period'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger inventory_pricing_period_validation before insert or update
  on private.inventory_sales_periods for each row
  execute function private.validate_inventory_pricing_period();

create function private.author_inventory_period_price(
  p_ws_id uuid, p_period_id uuid, p_actor_id uuid, p_product_id uuid,
  p_unit_id uuid, p_warehouse_id uuid, p_currency text, p_price numeric,
  p_starts_on date, p_ends_on date
) returns jsonb language plpgsql set search_path = pg_catalog, private, public as $$
declare
  v_period private.inventory_sales_periods;
  v_start timestamptz;
  v_end timestamptz;
  v_row private.inventory_product_prices;
begin
  select * into v_period from private.inventory_sales_periods
    where id = p_period_id and ws_id = p_ws_id for update;
  if not found or v_period.pricing_mode <> 'scheduled' or v_period.status <> 'active' then
    raise exception 'Scheduled active period required' using errcode = '23514';
  end if;
  if p_starts_on < v_period.starts_at or p_starts_on > v_period.ends_at or
    (p_ends_on is not null and (p_ends_on < p_starts_on or p_ends_on > v_period.ends_at)) then
    raise exception 'Price dates must be inside the period' using errcode = '23514';
  end if;
  if not exists (
    select 1 from private.inventory_units u, private.inventory_warehouses w,
      public.workspace_products p
    where u.id = p_unit_id and w.id = p_warehouse_id and p.id = p_product_id
      and u.ws_id = p_ws_id and w.ws_id = p_ws_id and p.ws_id = p_ws_id
  ) then
    raise exception 'Invalid stock workspace' using errcode = '23514';
  end if;
  -- Serialize first-price authoring with ordinary tuple edits as well as checkout.
  perform 1 from private.inventory_products where product_id=p_product_id
    and unit_id=p_unit_id and warehouse_id=p_warehouse_id for update;
  perform 1 from public.workspace_products where id=p_product_id and ws_id=p_ws_id for share;
  if not exists (select 1 from private.inventory_products where product_id=p_product_id and unit_id=p_unit_id and warehouse_id=p_warehouse_id) then
    raise exception 'Stock tuple required to author a price' using errcode='23514';
  end if;
  perform 1 from public.workspace_configs where ws_id = p_ws_id and id = 'DEFAULT_CURRENCY'
    and upper(value) = p_currency for share;
  if not found then raise exception 'Workspace currency changed' using errcode = '23514'; end if;
  v_start := p_starts_on::timestamp at time zone v_period.time_zone;
  v_end := (coalesce(p_ends_on, v_period.ends_at) + 1)::timestamp at time zone v_period.time_zone;
  if exists (select 1 from private.inventory_sale_price_snapshots s, jsonb_array_elements(s.lines) l
    where s.ws_id = p_ws_id and s.period_id = p_period_id and s.captured_at >= v_start
      and l->>'product_id' = p_product_id::text and l->>'unit_id' = p_unit_id::text
      and l->>'warehouse_id' = p_warehouse_id::text) then
    raise exception 'Cannot backdate a price across completed sales' using errcode = '23514';
  end if;
  -- Only close an earlier interval. Never overwrite an amount or same-start row.
  update private.inventory_product_prices set valid_to = v_start
    where period_id = p_period_id and product_id = p_product_id and unit_id = p_unit_id
      and warehouse_id = p_warehouse_id and valid_from < v_start
      and (valid_to is null or valid_to > v_start);
  insert into private.inventory_product_prices
    (ws_id, period_id, product_id, unit_id, warehouse_id, currency, price,
      valid_from, valid_to, created_by)
    values (p_ws_id, p_period_id, p_product_id, p_unit_id, p_warehouse_id,
      p_currency, p_price, v_start, v_end, p_actor_id) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- One transaction captures the approved prices, invoice, stock history and period.
-- Existing invoice triggers own wallet/revenue behavior exactly as before.
create function private.create_inventory_period_invoice(
  p_ws_id uuid, p_actor_id uuid, p_workspace_user_id uuid, p_period_id uuid,
  p_request_id uuid, p_currency text, p_invoice jsonb, p_products jsonb
) returns uuid language plpgsql set search_path = pg_catalog, private, public as $$
declare
  v_period private.inventory_sales_periods;
  v_line jsonb;
  v_price private.inventory_product_prices;
  v_product public.workspace_products;
  v_stock private.inventory_products;
  v_invoice_id uuid;
  v_existing private.inventory_sale_price_snapshots;
  v_total numeric := 0;
  v_now timestamptz;
  v_unit text;
  v_owner text;
  v_snapshots jsonb := '[]'::jsonb;
begin
  if p_request_id is null or jsonb_array_length(p_products) not between 1 and 500 then
    raise exception 'Invalid period invoice request' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text || p_request_id::text, 0));
  select * into v_existing from private.inventory_sale_price_snapshots
    where ws_id = p_ws_id and request_id = p_request_id;
  if found then
    if v_existing.actor_id <> p_actor_id or v_existing.period_id <> p_period_id then
      raise exception 'Request already used' using errcode = '23514';
    end if;
    if v_existing.request_payload <> jsonb_build_object('invoice', p_invoice, 'products', p_products, 'currency', p_currency) then
      raise exception 'Request already used for another cart' using errcode = '23514';
    end if;
    if not exists (select 1 from public.finance_invoices where id = v_existing.invoice_id and ws_id = p_ws_id) then
      raise exception 'Sale was deleted; request cannot be replayed' using errcode = '23514';
    end if;
    return v_existing.invoice_id;
  end if;
  select * into v_period from private.inventory_sales_periods
    where id = p_period_id and ws_id = p_ws_id for update;
  if not found or v_period.status <> 'active' then
    raise exception 'Invalid active sales period' using errcode = '23514';
  end if;
  if v_period.pricing_mode = 'scheduled' then
    perform 1 from public.workspace_configs where ws_id = p_ws_id and id = 'DEFAULT_CURRENCY'
      and upper(value) = p_currency for share;
    if not found then raise exception 'Workspace currency changed' using errcode = '23514'; end if;
    perform 1 from private.workspace_wallets where id = (p_invoice->>'wallet_id')::uuid
      and ws_id = p_ws_id and upper(currency) = p_currency for share;
    if not found then raise exception 'Wallet currency does not match season pricing' using errcode = '23514'; end if;
  end if;
  -- Lock stock tuples in deterministic order; preserve null/unlimited amounts.
  perform 1 from private.inventory_products ip where exists (
    select 1 from jsonb_array_elements(p_products) l
    where ip.product_id = (l->>'product_id')::uuid and ip.unit_id = (l->>'unit_id')::uuid
      and ip.warehouse_id = (l->>'warehouse_id')::uuid
  ) order by ip.product_id, ip.unit_id, ip.warehouse_id for update;
  v_now := clock_timestamp();
  if v_period.pricing_mode = 'scheduled' and not (
    v_now >= (v_period.starts_at::timestamp at time zone v_period.time_zone) and
    v_now < ((v_period.ends_at + 1)::timestamp at time zone v_period.time_zone)
  ) then
    raise exception 'Sales period is not current' using errcode = '23514';
  end if;
  for v_line in select value from jsonb_array_elements(p_products) loop
    select * into v_product from public.workspace_products
      where id = (v_line->>'product_id')::uuid and ws_id = p_ws_id and not archived for share;
    if not found or (v_line->>'quantity')::numeric <= 0 or
      (v_line->>'quantity')::numeric <> trunc((v_line->>'quantity')::numeric) then
      raise exception 'Invalid sold product or quantity' using errcode = '23514';
    end if;
    if (v_period.product_scope = 'allowlist' and not exists (
      select 1 from private.inventory_sales_period_products
      where period_id = p_period_id and product_id = v_product.id
    )) or (v_period.product_scope = 'blocklist' and exists (
      select 1 from private.inventory_sales_period_products
      where period_id = p_period_id and product_id = v_product.id
    )) then
      raise exception 'Sale does not match the sales period product rules' using errcode = '23514';
    end if;
    select ip.* into v_stock from private.inventory_products ip
      join private.inventory_units u on u.id = ip.unit_id and u.ws_id = p_ws_id
      join private.inventory_warehouses w on w.id = ip.warehouse_id and w.ws_id = p_ws_id
      where ip.product_id = v_product.id and ip.unit_id = (v_line->>'unit_id')::uuid
        and ip.warehouse_id = (v_line->>'warehouse_id')::uuid;
    if not found then raise exception 'Invalid stock tuple' using errcode = '23514'; end if;
    if v_period.pricing_mode = 'scheduled' and v_stock.amount is not null and v_stock.amount < (
      select sum((l->>'quantity')::numeric) from jsonb_array_elements(p_products) l
      where l->>'product_id' = v_line->>'product_id' and l->>'unit_id' = v_line->>'unit_id'
        and l->>'warehouse_id' = v_line->>'warehouse_id'
    ) then raise exception 'Insufficient stock' using errcode = '23514'; end if;
    if v_period.pricing_mode = 'scheduled' then
      select * into v_price from private.inventory_product_prices
        where id = (v_line->>'price_id')::uuid and period_id = p_period_id and ws_id = p_ws_id
          and product_id = v_stock.product_id and unit_id = v_stock.unit_id
          and warehouse_id = v_stock.warehouse_id and currency = p_currency
          and valid_from <= v_now and (valid_to is null or v_now < valid_to);
      if not found or v_price.price <> (v_line->>'price')::numeric then
        raise exception 'Price changed or expired; refresh and review the cart' using errcode = '23514';
      end if;
    end if;
    if (v_line->>'price')::numeric < 0 then
      raise exception 'Invalid price' using errcode = '23514';
    end if;
    v_total := v_total + (v_line->>'price')::numeric * (v_line->>'quantity')::numeric;
    v_snapshots := v_snapshots || jsonb_build_array(v_line);
  end loop;
  insert into public.finance_invoices
    (ws_id, customer_id, price, total_diff, note, notice, wallet_id, category_id,
      completed_at, valid_until, paid_amount, platform_creator_id, creator_id)
    values (p_ws_id, nullif(p_invoice->>'customer_id','')::uuid, v_total, 0,
      p_invoice->>'notes', p_invoice->>'content', (p_invoice->>'wallet_id')::uuid,
      (p_invoice->>'category_id')::uuid, v_now, v_now + interval '30 days',
      v_total, p_actor_id, p_workspace_user_id) returning id into v_invoice_id;
  for v_line in select value from jsonb_array_elements(p_products) loop
    select * into v_product from public.workspace_products where id = (v_line->>'product_id')::uuid;
    select name into v_unit from private.inventory_units where id = (v_line->>'unit_id')::uuid;
    select name into v_owner from private.inventory_owners where id = v_product.owner_id;
    insert into public.finance_invoice_products
      (invoice_id, product_name, product_unit, product_id, unit_id, warehouse_id,
        amount, price, owner_id, owner_name)
      values (v_invoice_id, v_product.name, coalesce(v_unit,''), v_product.id,
        (v_line->>'unit_id')::uuid, (v_line->>'warehouse_id')::uuid,
        (v_line->>'quantity')::numeric, (v_line->>'price')::numeric,
        v_product.owner_id, coalesce(v_owner,''));
    insert into public.product_stock_changes
      (product_id, unit_id, warehouse_id, amount, creator_id, beneficiary_id)
      values (v_product.id, (v_line->>'unit_id')::uuid, (v_line->>'warehouse_id')::uuid,
        -(v_line->>'quantity')::bigint, p_workspace_user_id,
        nullif(p_invoice->>'customer_id','')::uuid);
  end loop;
  insert into private.inventory_sales_period_assignments
    (ws_id, period_id, sale_source, sale_id, assigned_by, assigned_at)
    values (p_ws_id, p_period_id, 'finance_invoice', v_invoice_id, p_actor_id, v_now);
  insert into private.inventory_sale_price_snapshots
    (invoice_id, ws_id, request_id, actor_id, period_id, period_name, currency, captured_at, lines, request_payload)
    values (v_invoice_id, p_ws_id, p_request_id, p_actor_id, p_period_id, v_period.name,
      p_currency, v_now, v_snapshots, jsonb_build_object('invoice', p_invoice, 'products', p_products, 'currency', p_currency));
  insert into private.inventory_audit_logs
    (ws_id, event_kind, entity_kind, entity_id, entity_label, summary,
      actor_auth_uid, actor_workspace_user_id, "after")
    values (p_ws_id, 'sale_created', 'sale', v_invoice_id, v_invoice_id::text,
      'Created period-linked inventory sale', p_actor_id, p_workspace_user_id,
      jsonb_build_object('period_id', p_period_id, 'currency', p_currency, 'lines', v_snapshots));
  return v_invoice_id;
end;
$$;

revoke all on function private.lock_inventory_pricing_period(),
  private.validate_inventory_pricing_period(),
  private.author_inventory_period_price(uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,date,date),
  private.create_inventory_period_invoice(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function private.lock_inventory_pricing_period(),
  private.validate_inventory_pricing_period(),
  private.author_inventory_period_price(uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,date,date),
  private.create_inventory_period_invoice(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb)
  to service_role;
