begin;

create or replace function private.assign_workspace_user_referral(
  p_ws_id uuid,
  p_referrer_user_id uuid,
  p_referred_user_id uuid,
  p_actor_user_id uuid
)
returns table(
  status text,
  referral_promotion_id uuid,
  linked_promotion_id uuid
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_current_referral_count integer;
  v_linked_promotion_id uuid := null;
  v_referred public.workspace_users%rowtype;
  v_referral_promotion_id uuid;
  v_referrer public.workspace_users%rowtype;
  v_settings public.workspace_settings%rowtype;
begin
  if p_referrer_user_id is null
    or p_referred_user_id is null
    or p_ws_id is null then
    return query select 'invalid_input'::text, null::uuid, null::uuid;
    return;
  end if;

  if p_referrer_user_id = p_referred_user_id then
    return query select 'self_referral'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
  into v_referrer
  from public.workspace_users
  where id = p_referrer_user_id
    and ws_id = p_ws_id
  for update;

  if not found then
    return query select 'referrer_not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_referrer.archived is true then
    return query select 'referrer_archived'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
  into v_referred
  from public.workspace_users
  where id = p_referred_user_id
    and ws_id = p_ws_id
  for update;

  if not found then
    return query select 'referred_user_not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_referred.archived is true then
    return query select 'referred_user_archived'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_referred.referred_by = p_referrer_user_id then
    select id
    into v_referral_promotion_id
    from private.workspace_promotions
    where ws_id = p_ws_id
      and promo_type = 'REFERRAL'::public.promotion_type
      and owner_id = p_referrer_user_id
    limit 1;

    return query
      select
        'already_referred_to_referrer'::text,
        v_referral_promotion_id,
        null::uuid;
    return;
  end if;

  if v_referred.referred_by is not null then
    return query select 'target_already_referred'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_referrer.referred_by = p_referred_user_id then
    return query select 'cycle_detected'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
  into v_settings
  from public.workspace_settings
  where ws_id = p_ws_id;

  if not found then
    return query select 'settings_missing'::text, null::uuid, null::uuid;
    return;
  end if;

  select count(*)
  into v_current_referral_count
  from public.workspace_users
  where ws_id = p_ws_id
    and referred_by = p_referrer_user_id
    and archived = false;

  if v_current_referral_count >= v_settings.referral_count_cap then
    return query select 'cap_reached'::text, null::uuid, null::uuid;
    return;
  end if;

  select id
  into v_referral_promotion_id
  from private.workspace_promotions
  where ws_id = p_ws_id
    and promo_type = 'REFERRAL'::public.promotion_type
    and owner_id = p_referrer_user_id
  limit 1;

  if v_referral_promotion_id is null then
    begin
      insert into private.workspace_promotions (
        ws_id,
        owner_id,
        promo_type,
        value,
        code,
        name,
        description,
        use_ratio,
        creator_id
      )
      values (
        p_ws_id,
        p_referrer_user_id,
        'REFERRAL'::public.promotion_type,
        0,
        'REF',
        'Referral',
        'Referral Code for Referral System',
        true,
        p_actor_user_id
      )
      returning id into v_referral_promotion_id;
    exception
      when unique_violation then
        select id
        into v_referral_promotion_id
        from private.workspace_promotions
        where ws_id = p_ws_id
          and promo_type = 'REFERRAL'::public.promotion_type
          and owner_id = p_referrer_user_id
        limit 1;
    end;
  end if;

  update public.workspace_users
  set
    referred_by = p_referrer_user_id,
    updated_by = p_actor_user_id
  where id = p_referred_user_id
    and ws_id = p_ws_id
    and referred_by is null;

  if v_settings.referral_reward_type in (
    'RECEIVER'::public.referral_reward_type,
    'BOTH'::public.referral_reward_type
  ) and v_settings.referral_promotion_id is not null then
    insert into private.user_linked_promotions (user_id, promo_id)
    values (p_referred_user_id, v_settings.referral_promotion_id)
    on conflict (user_id, promo_id) do nothing;

    v_linked_promotion_id := v_settings.referral_promotion_id;
  end if;

  return query
    select
      'success'::text,
      v_referral_promotion_id,
      v_linked_promotion_id;
end;
$function$;

create or replace function private.remove_workspace_user_referral(
  p_ws_id uuid,
  p_referrer_user_id uuid,
  p_referred_user_id uuid,
  p_actor_user_id uuid
)
returns table(
  status text,
  removed_promotion_id uuid
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_referred public.workspace_users%rowtype;
  v_removed_promotion_id uuid := null;
begin
  if p_referrer_user_id is null
    or p_referred_user_id is null
    or p_ws_id is null then
    return query select 'invalid_input'::text, null::uuid;
    return;
  end if;

  select *
  into v_referred
  from public.workspace_users
  where id = p_referred_user_id
    and ws_id = p_ws_id
  for update;

  if not found then
    return query select 'referred_user_not_found'::text, null::uuid;
    return;
  end if;

  if v_referred.referred_by is distinct from p_referrer_user_id then
    return query select 'not_referred_by_referrer'::text, null::uuid;
    return;
  end if;

  update public.workspace_users
  set
    referred_by = null,
    updated_by = p_actor_user_id
  where id = p_referred_user_id
    and ws_id = p_ws_id
    and referred_by = p_referrer_user_id;

  select referral_promotion_id
  into v_removed_promotion_id
  from public.workspace_settings
  where ws_id = p_ws_id;

  if v_removed_promotion_id is not null then
    delete from private.user_linked_promotions
    where user_id = p_referred_user_id
      and promo_id = v_removed_promotion_id;
  end if;

  return query select 'success'::text, v_removed_promotion_id;
end;
$function$;

create or replace function private.calculate_invoice_values(
  p_ws_id uuid,
  p_products jsonb,
  p_promotion_id uuid default null::uuid,
  p_frontend_subtotal numeric default null::numeric,
  p_frontend_discount_amount numeric default null::numeric,
  p_frontend_total numeric default null::numeric,
  p_is_subscription_invoice boolean default false
)
returns table(
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
as $function$
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
      normalized.product_id,
      normalized.unit_id,
      normalized.warehouse_id,
      inventory.price,
      normalized.quantity
    from normalized
    join private.inventory_products inventory
      on inventory.product_id = normalized.product_id
     and inventory.unit_id = normalized.unit_id
     and inventory.warehouse_id = normalized.warehouse_id
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
      promotion.id,
      promotion.name,
      promotion.code,
      promotion.description,
      case
        when promotion.promo_type = 'REFERRAL'::public.promotion_type
          then coalesce(referral_discount.calculated_discount_value, 0)::numeric
        else promotion.value
      end as effective_value,
      case
        when promotion.promo_type = 'REFERRAL'::public.promotion_type
          then true
        else promotion.use_ratio
      end as effective_use_ratio,
      promotion.max_uses,
      promotion.current_uses
    into v_promotion
    from private.workspace_promotions promotion
    left join private.v_user_referral_discounts referral_discount
      on referral_discount.promo_id = promotion.id
     and referral_discount.ws_id = promotion.ws_id
     and referral_discount.user_id = promotion.owner_id
    where promotion.id = p_promotion_id
      and promotion.ws_id = p_ws_id
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
    promotion_value := v_promotion.effective_value;
    promotion_use_ratio := v_promotion.effective_use_ratio;

    if coalesce(v_promotion.effective_use_ratio, false) then
      discount_amount := subtotal * (v_promotion.effective_value / 100);
    else
      discount_amount := least(v_promotion.effective_value, subtotal);
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
$function$;

revoke all on function private.assign_workspace_user_referral(
  uuid,
  uuid,
  uuid,
  uuid
) from anon, authenticated, public;

revoke all on function private.remove_workspace_user_referral(
  uuid,
  uuid,
  uuid,
  uuid
) from anon, authenticated, public;

revoke all on function private.calculate_invoice_values(
  uuid,
  jsonb,
  uuid,
  numeric,
  numeric,
  numeric,
  boolean
) from anon, authenticated, public;

grant execute on function private.assign_workspace_user_referral(
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;

grant execute on function private.remove_workspace_user_referral(
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;

grant execute on function private.calculate_invoice_values(
  uuid,
  jsonb,
  uuid,
  numeric,
  numeric,
  numeric,
  boolean
) to service_role;

notify pgrst, 'reload schema';

commit;
