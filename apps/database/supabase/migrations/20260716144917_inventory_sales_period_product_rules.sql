alter table private.inventory_sales_periods
add column product_scope text not null default 'all'
check (product_scope in ('all', 'allowlist', 'blocklist'));

create table private.inventory_sales_period_products (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  period_id uuid not null,
  product_id uuid not null references public.workspace_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (period_id, product_id),
  constraint inventory_sales_period_products_period_fkey
    foreign key (period_id, ws_id)
    references private.inventory_sales_periods(id, ws_id)
    on delete cascade
);

create index inventory_sales_period_products_workspace_idx
  on private.inventory_sales_period_products (ws_id, product_id, period_id);

create or replace function private.assert_inventory_sales_period_product_scope()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.workspace_products product
    where product.id = new.product_id
      and product.ws_id = new.ws_id
  ) then
    raise exception 'Product does not belong to the sales period workspace'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger inventory_sales_period_products_scope
before insert or update on private.inventory_sales_period_products
for each row execute function private.assert_inventory_sales_period_product_scope();

alter table private.inventory_sales_period_products enable row level security;

create policy "Service role can manage inventory sales period products"
  on private.inventory_sales_period_products
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table private.inventory_sales_period_products
  from public, anon, authenticated;
grant all on table private.inventory_sales_period_products to service_role;

revoke all on function private.assert_inventory_sales_period_product_scope()
  from public, anon, authenticated;
grant execute on function private.assert_inventory_sales_period_product_scope()
  to service_role;
