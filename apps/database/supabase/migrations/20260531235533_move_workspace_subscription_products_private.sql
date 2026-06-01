begin;

alter table if exists public.workspace_subscription_products
  set schema private;

alter table if exists private.workspace_subscription_products
  enable row level security;

drop policy if exists "only allow admin to insert"
  on private.workspace_subscription_products;

drop policy if exists "Service role can manage private workspace subscription products"
  on private.workspace_subscription_products;

create policy "Service role can manage private workspace subscription products"
  on private.workspace_subscription_products
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table private.workspace_subscription_products
  from anon, authenticated;

grant all on table private.workspace_subscription_products
  to service_role;

create or replace function public._resolve_workspace_tier(p_ws_id uuid)
returns workspace_product_tier
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $function$
begin
  return coalesce(
    (
      select product.tier
      from public.workspace_subscriptions subscription
      join private.workspace_subscription_products product
        on product.id = subscription.product_id
      where subscription.ws_id = p_ws_id
        and subscription.status = 'active'
      order by subscription.created_at desc
      limit 1
    ),
    'FREE'::workspace_product_tier
  );
end;
$function$;

create or replace function public.deduct_ai_credits(
  p_ws_id uuid,
  p_model_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer default 0,
  p_feature text default null::text,
  p_execution_id uuid default null::uuid,
  p_chat_message_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  success boolean,
  credits_deducted numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_balance record;
  v_cost_usd numeric;
  v_credits numeric;
  v_tier workspace_product_tier;
  v_markup numeric;
  v_new_total_used numeric;
  v_remaining numeric;
begin
  select *
  into v_balance
  from public.get_or_create_credit_balance(p_ws_id);

  if not found then
    return query select false, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  v_tier := public._resolve_workspace_tier(p_ws_id);

  select coalesce(markup_multiplier, 1.0)
  into v_markup
  from public.ai_credit_plan_allocations
  where tier = v_tier
    and is_active = true;

  if v_markup is null then
    v_markup := 1.0;
  end if;

  v_cost_usd := public.compute_ai_cost_from_gateway(
    p_model_id,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens
  );

  v_credits := (v_cost_usd / 0.0001) * v_markup;

  if v_credits < 1
    and (
      coalesce(p_input_tokens, 0)
      + coalesce(p_output_tokens, 0)
      + coalesce(p_reasoning_tokens, 0)
    ) > 0 then
    v_credits := 1;
  end if;

  update public.workspace_ai_credit_balances
  set
    total_used = total_used + v_credits,
    updated_at = now()
  where id = v_balance.id
  returning total_used into v_new_total_used;

  v_remaining :=
    v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used;

  insert into public.ai_credit_transactions (
    ws_id,
    balance_id,
    execution_id,
    chat_message_id,
    transaction_type,
    amount,
    cost_usd,
    model_id,
    feature,
    input_tokens,
    output_tokens,
    reasoning_tokens,
    metadata
  )
  values (
    p_ws_id,
    v_balance.id,
    p_execution_id,
    p_chat_message_id,
    'deduction',
    -v_credits,
    v_cost_usd,
    p_model_id,
    p_feature,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_metadata
  );

  return query select true, v_credits, v_remaining, null::text;
  return;
end;
$function$;

create or replace function public.get_or_create_credit_balance(p_ws_id uuid)
returns setof workspace_ai_credit_balances
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_balance record;
  v_tier workspace_product_tier;
  v_allocation record;
begin
  v_period_start := date_trunc('month', now());
  v_period_end := date_trunc('month', now()) + interval '1 month';

  select *
  into v_balance
  from public.workspace_ai_credit_balances
  where ws_id = p_ws_id
    and period_start = v_period_start;

  if found then
    return next v_balance;
    return;
  end if;

  v_tier := public._resolve_workspace_tier(p_ws_id);

  select *
  into v_allocation
  from public.ai_credit_plan_allocations
  where tier = v_tier
    and is_active = true;

  if not found then
    insert into public.workspace_ai_credit_balances (
      ws_id,
      period_start,
      period_end,
      total_allocated,
      total_used,
      bonus_credits
    )
    values (p_ws_id, v_period_start, v_period_end, 0, 0, 0)
    on conflict (ws_id, period_start) do nothing;
  else
    insert into public.workspace_ai_credit_balances (
      ws_id,
      period_start,
      period_end,
      total_allocated,
      total_used,
      bonus_credits
    )
    values (
      p_ws_id,
      v_period_start,
      v_period_end,
      v_allocation.monthly_credits,
      0,
      0
    )
    on conflict (ws_id, period_start) do nothing;
  end if;

  select *
  into v_balance
  from public.workspace_ai_credit_balances
  where ws_id = p_ws_id
    and period_start = v_period_start;

  insert into public.ai_credit_transactions (
    ws_id,
    balance_id,
    transaction_type,
    amount,
    feature,
    metadata
  )
  values (
    p_ws_id,
    v_balance.id,
    'allocation',
    v_balance.total_allocated,
    null,
    jsonb_build_object(
      'tier',
      v_tier::text,
      'period_start',
      v_period_start::text
    )
  )
  on conflict do nothing;

  return next v_balance;
  return;
end;
$function$;

create or replace function public.get_user_workspace_subscription_info(
  _user_id uuid
)
returns table(
  ws_id uuid,
  ws_name text,
  ws_personal boolean,
  member_count bigint,
  polar_subscription_id text,
  subscription_tier text,
  pricing_model text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select
    workspace.id as ws_id,
    coalesce(workspace.name, 'Unnamed Workspace') as ws_name,
    workspace.personal as ws_personal,
    (
      select count(*)
      from public.workspace_members member_count_rows
      where member_count_rows.ws_id = workspace.id
    ) as member_count,
    subscription.polar_subscription_id,
    product.tier::text as subscription_tier,
    product.pricing_model::text as pricing_model
  from public.workspace_members member
  join public.workspaces workspace
    on workspace.id = member.ws_id
  left join public.workspace_subscriptions subscription
    on subscription.ws_id = workspace.id
   and subscription.status in ('active', 'trialing', 'past_due')
  left join private.workspace_subscription_products product
    on product.id = subscription.product_id
  where member.user_id = _user_id
    and workspace.id != '00000000-0000-0000-0000-000000000000';
$function$;

create or replace function public.get_workspace_storage_limit(p_ws_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_limit_value text;
  v_ws_tier text;
begin
  select value
  into v_limit_value
  from public.workspace_secrets
  where ws_id = p_ws_id
    and name = 'STORAGE_LIMIT_BYTES'
  limit 1;

  if v_limit_value is not null then
    begin
      return v_limit_value::bigint;
    exception
      when others then
        null;
    end;
  end if;

  if p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid then
    return 1099511627776;
  end if;

  select product.tier::text
  into v_ws_tier
  from public.workspace_subscriptions subscription
  join private.workspace_subscription_products product
    on subscription.product_id = product.id
  where subscription.ws_id = p_ws_id
    and subscription.status in ('active', 'trialing', 'past_due')
  order by
    case product.tier
      when 'ENTERPRISE' then 4
      when 'PRO' then 3
      when 'PLUS' then 2
      when 'FREE' then 1
      else 0
    end desc
  limit 1;

  if v_ws_tier in ('PRO', 'ENTERPRISE') then
    return 107374182400;
  elsif v_ws_tier = 'PLUS' then
    return 21474836480;
  else
    return 104857600;
  end if;
end;
$function$;

create or replace function public.workspace_has_available_seats(
  target_ws_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  pricing_model_val public.workspace_pricing_model;
  seat_limit integer;
  current_usage integer;
begin
  select product.pricing_model, subscription.seat_count
  into pricing_model_val, seat_limit
  from public.workspace_subscriptions subscription
  join private.workspace_subscription_products product
    on product.id = subscription.product_id
  where subscription.ws_id = target_ws_id
    and subscription.status in ('active', 'trialing', 'past_due')
  order by subscription.created_at desc
  limit 1;

  if pricing_model_val is null or pricing_model_val != 'seat_based' then
    return true;
  end if;

  if seat_limit is null then
    return true;
  end if;

  select (
    (select count(*) from public.workspace_members where ws_id = target_ws_id)
    + (
      select count(*)
      from public.workspace_invites
      where ws_id = target_ws_id
    )
    + (
      select count(*)
      from public.workspace_email_invites
      where ws_id = target_ws_id
    )
  )
  into current_usage;

  return current_usage < seat_limit;
end;
$function$;

commit;
