begin;

alter table if exists public.workspace_promotions
  set schema private;

do $$
begin
  if to_regprocedure('public.increment_promotion_uses()') is not null then
    alter function public.increment_promotion_uses()
      set schema private;
  end if;
end $$;

do $$
begin
  if to_regclass('public.v_user_referral_discounts') is not null then
    alter view public.v_user_referral_discounts
      set schema private;
  end if;
end $$;

create or replace view private.v_user_referral_discounts
with (security_invoker = true)
as
with referral_counts as (
  select
    workspace_users.referred_by as user_id,
    count(*) as active_referral_count
  from public.workspace_users
  where workspace_users.referred_by is not null
    and workspace_users.archived = false
  group by workspace_users.referred_by
)
select
  promotion.id as promo_id,
  promotion.owner_id as user_id,
  promotion.code as promo_code,
  case
    when settings.referral_reward_type = 'RECEIVER'::referral_reward_type then 0::bigint
    else least(
      coalesce(referral_counts.active_referral_count, 0::bigint),
      settings.referral_count_cap::bigint
    ) * settings.referral_increment_percent
  end as calculated_discount_value,
  promotion.ws_id
from private.workspace_promotions promotion
left join referral_counts
  on promotion.owner_id = referral_counts.user_id
join public.workspace_settings settings
  on promotion.ws_id = settings.ws_id
where promotion.promo_type = 'REFERRAL'::promotion_type;

create or replace function private.increment_promotion_uses()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_max_uses integer;
  v_current_uses integer;
begin
  if new.promo_id is null then
    return new;
  end if;

  select max_uses, current_uses
  into v_max_uses, v_current_uses
  from private.workspace_promotions
  where id = new.promo_id
  for update;

  if not found then
    return new;
  end if;

  if v_max_uses is not null and v_current_uses >= v_max_uses then
    raise exception 'Promotion usage limit reached'
      using errcode = '23514';
  end if;

  update private.workspace_promotions
  set current_uses = current_uses + 1
  where id = new.promo_id;

  return new;
end;
$function$;

create or replace function private.auto_link_referral_promotion()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
begin
  insert into private.user_linked_promotions (user_id, promo_id)
  values (new.owner_id, new.id);

  return new;
end;
$function$;

create or replace function private.fn_prevent_invalid_referral_link()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  promo record;
begin
  select *
  into promo
  from private.workspace_promotions
  where id = new.promo_id;

  if promo.promo_type = 'REFERRAL'
    and promo.owner_id is distinct from new.user_id then
    raise exception 'Referral promotions can only be linked to their owner.';
  end if;

  return new;
end;
$function$;

create or replace function private.fn_prevent_owner_referral_unlink()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  promo record;
begin
  select *
  into promo
  from private.workspace_promotions
  where id = old.promo_id;

  if promo.promo_type = 'REFERRAL'
    and promo.owner_id = old.user_id then
    raise exception 'You cannot unlink your own referral promotion.';
  end if;

  return old;
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
      id,
      name,
      code,
      description,
      value,
      use_ratio,
      max_uses,
      current_uses
    into v_promotion
    from private.workspace_promotions
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
$function$;

drop trigger if exists t_auto_link_referral_promo
  on private.workspace_promotions;

create trigger t_auto_link_referral_promo
after insert on private.workspace_promotions
for each row
when (
  new.promo_type = 'REFERRAL'::promotion_type
  and new.owner_id is not null
)
execute function private.auto_link_referral_promotion();

drop trigger if exists trg_increment_promotion_uses
  on public.finance_invoice_promotions;

create trigger trg_increment_promotion_uses
after insert on public.finance_invoice_promotions
for each row
execute function private.increment_promotion_uses();

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_promotions'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

alter table private.workspace_promotions enable row level security;

revoke all on table private.workspace_promotions
  from anon, authenticated, public;
revoke all on table private.v_user_referral_discounts
  from anon, authenticated, public;

grant all on table private.workspace_promotions
  to service_role;
grant select on table private.v_user_referral_discounts
  to service_role;

create policy "Service role can manage private workspace promotions"
on private.workspace_promotions
for all
to service_role
using (true)
with check (true);

revoke all on function private.increment_promotion_uses()
  from anon, authenticated, public;
revoke all on function private.auto_link_referral_promotion()
  from anon, authenticated, public;
revoke all on function private.fn_prevent_invalid_referral_link()
  from anon, authenticated, public;
revoke all on function private.fn_prevent_owner_referral_unlink()
  from anon, authenticated, public;
revoke all on function private.calculate_invoice_values(
  uuid,
  jsonb,
  uuid,
  numeric,
  numeric,
  numeric,
  boolean
) from anon, authenticated, public;

grant execute on function private.increment_promotion_uses()
  to service_role;
grant execute on function private.auto_link_referral_promotion()
  to service_role;
grant execute on function private.fn_prevent_invalid_referral_link()
  to service_role;
grant execute on function private.fn_prevent_owner_referral_unlink()
  to service_role;
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
