create schema if not exists private;

grant usage on schema private to service_role;

create or replace function private.calculate_invoice_values(
  p_ws_id uuid,
  p_products jsonb,
  p_promotion_id uuid default null,
  p_frontend_subtotal numeric default null,
  p_frontend_discount_amount numeric default null,
  p_frontend_total numeric default null,
  p_is_subscription_invoice boolean default false
)
returns table (
  subtotal numeric,
  discount_amount numeric,
  total numeric,
  values_recalculated boolean,
  rounding_applied numeric,
  allow_promotions boolean,
  promotion_id uuid,
  promotion_name text,
  promotion_code text,
  promotion_description text,
  promotion_value numeric,
  promotion_use_ratio boolean
)
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_invalid_count integer;
  v_matched_count integer;
  v_promotion record;
  v_requested_count integer;
  v_total_before_rounding numeric;
begin
  if p_products is null
    or jsonb_typeof(p_products) <> 'array'
    or jsonb_array_length(p_products) = 0 then
    raise exception 'Products are required' using errcode = '22023';
  end if;

  with requested as (
    select *
    from jsonb_to_recordset(p_products) as product(
      product_id uuid,
      unit_id uuid,
      warehouse_id uuid,
      quantity numeric
    )
  ),
  invalid_requested as (
    select 1
    from requested
    where product_id is null
      or unit_id is null
      or warehouse_id is null
      or quantity is null
      or quantity <= 0
  ),
  normalized as (
    select
      product_id,
      unit_id,
      warehouse_id,
      sum(quantity) as quantity
    from requested
    group by product_id, unit_id, warehouse_id
  ),
  matched as (
    select
      n.product_id,
      n.unit_id,
      n.warehouse_id,
      inventory.price,
      n.quantity
    from normalized n
    join private.inventory_products inventory
      on inventory.product_id = n.product_id
     and inventory.unit_id = n.unit_id
     and inventory.warehouse_id = n.warehouse_id
    join public.workspace_products product
      on product.id = inventory.product_id
     and product.ws_id = p_ws_id
     and product.archived = false
  )
  select
    (select count(*) from invalid_requested),
    (select count(*) from normalized),
    (select count(*) from matched),
    coalesce((select sum(price * quantity) from matched), 0)
  into v_invalid_count, v_requested_count, v_matched_count, subtotal;

  if v_invalid_count > 0 or v_requested_count = 0 then
    raise exception 'Invalid invoice product payload' using errcode = '22023';
  end if;

  if v_matched_count <> v_requested_count then
    raise exception 'Product not found or not available' using errcode = '22023';
  end if;

  discount_amount := 0;
  promotion_id := null;
  promotion_name := null;
  promotion_code := null;
  promotion_description := null;
  promotion_value := null;
  promotion_use_ratio := null;

  if p_is_subscription_invoice then
    allow_promotions := true;
  else
    select coalesce((
      select case
        when lower(value) = 'false' then false
        when lower(value) = 'true' then true
        else true
      end
      from public.workspace_configs
      where ws_id = p_ws_id
        and id = 'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD'
      limit 1
    ), true)
    into allow_promotions;
  end if;

  if p_promotion_id is not null and allow_promotions then
    select
      id,
      name,
      code,
      description,
      value,
      use_ratio,
      max_uses,
      current_uses
    into v_promotion
    from public.workspace_promotions
    where id = p_promotion_id
      and ws_id = p_ws_id
    limit 1;

    if not found then
      raise exception 'Invalid promotion: %', p_promotion_id using errcode = '22023';
    end if;

    if v_promotion.max_uses is not null
      and coalesce(v_promotion.current_uses, 0) >= v_promotion.max_uses then
      raise exception 'Promotion usage limit reached' using errcode = 'P0001';
    end if;

    promotion_id := v_promotion.id;
    promotion_name := v_promotion.name;
    promotion_code := v_promotion.code;
    promotion_description := v_promotion.description;
    promotion_value := v_promotion.value;
    promotion_use_ratio := v_promotion.use_ratio;

    if coalesce(v_promotion.use_ratio, false) then
      discount_amount := subtotal * (v_promotion.value / 100);
    else
      discount_amount := least(v_promotion.value, subtotal);
    end if;
  end if;

  v_total_before_rounding := subtotal - discount_amount;

  if p_frontend_total is not null then
    total := p_frontend_total;
    rounding_applied := total - v_total_before_rounding;
  else
    total := v_total_before_rounding;
    rounding_applied := 0;
  end if;

  values_recalculated :=
    case
      when p_frontend_subtotal is null
        and p_frontend_discount_amount is null
        and p_frontend_total is null then true
      else abs(subtotal - coalesce(p_frontend_subtotal, 0)) > 0.01
        or abs(discount_amount - coalesce(p_frontend_discount_amount, 0)) > 0.01
    end;

  return next;
end;
$$;

revoke all on function private.calculate_invoice_values(
  uuid,
  jsonb,
  uuid,
  numeric,
  numeric,
  numeric,
  boolean
) from public, anon, authenticated;

grant execute on function private.calculate_invoice_values(
  uuid,
  jsonb,
  uuid,
  numeric,
  numeric,
  numeric,
  boolean
) to service_role;

comment on function private.calculate_invoice_values(
  uuid,
  jsonb,
  uuid,
  numeric,
  numeric,
  numeric,
  boolean
) is 'Calculates invoice subtotal, promotion discount, rounding, and recalculation deltas for server-owned invoice creation flows after private inventory table moves.';

notify pgrst, 'reload schema';
