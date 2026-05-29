create or replace function public.update_inventory_product_amount()
returns trigger
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    update private.inventory_products ip
    set amount = ip.amount + new.amount
    where ip.product_id = new.product_id
      and ip.unit_id = new.unit_id
      and ip.warehouse_id = (
        select ib.warehouse_id
        from private.inventory_batches ib
        where ib.id = new.batch_id
      );
  elsif (tg_op = 'UPDATE') then
    update private.inventory_products ip
    set amount = ip.amount - old.amount + new.amount
    where ip.product_id = new.product_id
      and ip.unit_id = new.unit_id
      and ip.warehouse_id = (
        select ib.warehouse_id
        from private.inventory_batches ib
        where ib.id = new.batch_id
      );
  elsif (tg_op = 'DELETE') then
    update private.inventory_products ip
    set amount = ip.amount - old.amount
    where ip.product_id = old.product_id
      and ip.unit_id = old.unit_id
      and ip.warehouse_id = (
        select ib.warehouse_id
        from private.inventory_batches ib
        where ib.id = old.batch_id
      );
  end if;

  return null;
end;
$$;

create or replace function public.update_inventory_products_from_invoice()
returns trigger
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update private.inventory_products ip
    set amount = ip.amount - new.amount
    where ip.product_id = new.product_id
      and ip.unit_id = new.unit_id
      and ip.warehouse_id = new.warehouse_id;
  elsif tg_op = 'UPDATE' then
    update private.inventory_products ip
    set amount = ip.amount - new.amount + old.amount
    where ip.product_id = new.product_id
      and ip.unit_id = new.unit_id
      and ip.warehouse_id = new.warehouse_id;
  elsif tg_op = 'DELETE' then
    update private.inventory_products ip
    set amount = ip.amount + old.amount
    where ip.product_id = old.product_id
      and ip.unit_id = old.unit_id
      and ip.warehouse_id = old.warehouse_id;
  end if;

  return null;
end;
$$;

create or replace function public.update_invoice_products_warehouse()
returns trigger
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.warehouse = coalesce(
      (
        select warehouse.name
        from private.inventory_warehouses warehouse
        where warehouse.id = new.warehouse_id
      ),
      old.warehouse
    );

    return new;
  elsif tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
