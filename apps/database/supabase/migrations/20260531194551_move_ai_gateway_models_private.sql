create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

do $$
begin
  if to_regclass('public.ai_gateway_models') is not null then
    alter table public.ai_gateway_models set schema private;
  end if;
end;
$$;

alter table private.ai_gateway_models enable row level security;

revoke all on table private.ai_gateway_models from public, anon, authenticated;
grant select, insert, update, delete on table private.ai_gateway_models to service_role;

drop policy if exists "ai_gateway_models_select_authenticated"
  on private.ai_gateway_models;

drop policy if exists "Service role can manage private AI gateway models"
  on private.ai_gateway_models;

create policy "Service role can manage private AI gateway models"
  on private.ai_gateway_models
  for all
  to service_role
  using (true)
  with check (true);

update private.ai_gateway_models
set
  context_window = 8192,
  max_tokens = 3072,
  description = coalesce(
    description,
    'Google Gemini Embedding 2 multimodal embedding model. Default output dimension is 3072.'
  )
where id = 'google/gemini-embedding-2';

drop trigger if exists prevent_disabling_default_ai_gateway_models_trigger
  on private.ai_gateway_models;

drop trigger if exists validate_ai_credit_plan_allocation_defaults_trigger
  on public.ai_credit_plan_allocations;

drop function if exists public.prevent_disabling_default_ai_gateway_models();
drop function if exists public.validate_ai_credit_plan_allocation_defaults();
drop function if exists public.check_ai_credit_allowance(
  uuid,
  text,
  text,
  integer
);
drop function if exists public.compute_ai_cost_from_gateway(
  text,
  integer,
  integer,
  integer,
  integer,
  integer
);

create or replace function private.prevent_disabling_default_ai_gateway_models()
returns trigger
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_tier public.workspace_product_tier;
begin
  if old.is_enabled is true and new.is_enabled is false then
    select tier
      into v_tier
      from public.ai_credit_plan_allocations
     where default_language_model = old.id
        or default_image_model = old.id
     limit 1;

    if v_tier is not null then
      raise exception
        'Cannot disable model % because it is configured as a default model for the % plan',
        old.id,
        v_tier;
    end if;
  end if;

  return new;
end;
$$;

create trigger prevent_disabling_default_ai_gateway_models_trigger
before update of is_enabled
on private.ai_gateway_models
for each row
execute function private.prevent_disabling_default_ai_gateway_models();

create or replace function private.validate_ai_credit_plan_allocation_defaults()
returns trigger
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_language_type text;
  v_image_type text;
  v_language_enabled boolean;
  v_image_enabled boolean;
begin
  if new.default_language_model is not null then
    select type, is_enabled
      into v_language_type, v_language_enabled
      from private.ai_gateway_models
     where id = new.default_language_model;

    if v_language_type is distinct from 'language' then
      raise exception
        'Default language model % must reference an enabled language gateway model',
        new.default_language_model;
    end if;

    if v_language_enabled is not true then
      raise exception
        'Default language model % must remain enabled',
        new.default_language_model;
    end if;
  end if;

  if new.default_image_model is not null then
    select type, is_enabled
      into v_image_type, v_image_enabled
      from private.ai_gateway_models
     where id = new.default_image_model;

    if v_image_type is distinct from 'image' then
      raise exception
        'Default image model % must reference an enabled image gateway model',
        new.default_image_model;
    end if;

    if v_image_enabled is not true then
      raise exception
        'Default image model % must remain enabled',
        new.default_image_model;
    end if;
  end if;

  if coalesce(array_length(new.allowed_models, 1), 0) > 0 then
    if new.default_language_model is not null and not exists (
      select 1
        from unnest(new.allowed_models) as allowed_model
       where allowed_model = new.default_language_model
          or split_part(allowed_model, '/', 2) = split_part(new.default_language_model, '/', 2)
    ) then
      raise exception
        'Default language model % must be included in allowed_models for tier %',
        new.default_language_model,
        new.tier;
    end if;

    if new.default_image_model is not null and not exists (
      select 1
        from unnest(new.allowed_models) as allowed_model
       where allowed_model = new.default_image_model
          or split_part(allowed_model, '/', 2) = split_part(new.default_image_model, '/', 2)
    ) then
      raise exception
        'Default image model % must be included in allowed_models for tier %',
        new.default_image_model,
        new.tier;
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_ai_credit_plan_allocation_defaults_trigger
before insert or update of allowed_models, default_language_model, default_image_model
on public.ai_credit_plan_allocations
for each row
execute function private.validate_ai_credit_plan_allocation_defaults();

create or replace function private.compute_ai_cost_from_gateway(
  p_model_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer default 0,
  p_image_count integer default 0,
  p_search_count integer default 0
)
returns numeric
language plpgsql
stable
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_model record;
  v_input_cost numeric := 0;
  v_output_cost numeric := 0;
  v_reasoning_cost numeric := 0;
  v_image_cost numeric := 0;
  v_search_cost numeric := 0;
  v_tier jsonb;
  v_tier_cost numeric;
  v_tier_min integer;
  v_tier_max integer;
  v_bare_model text;
begin
  select input_price_per_token, output_price_per_token,
         input_tiers, output_tiers, image_gen_price, search_price
    into v_model
    from private.ai_gateway_models
   where id = p_model_id;

  if not found then
    select input_price_per_token, output_price_per_token,
           input_tiers, output_tiers, image_gen_price, search_price
      into v_model
      from private.ai_gateway_models
     where id = 'google/' || p_model_id;
  end if;

  if not found then
    v_bare_model := case when p_model_id like '%/%'
      then substring(p_model_id from position('/' in p_model_id) + 1)
      else p_model_id end;

    return public.compute_ai_cost_usd(
      v_bare_model,
      coalesce(p_input_tokens, 0)::numeric,
      coalesce(p_output_tokens, 0)::numeric,
      coalesce(p_reasoning_tokens, 0)::numeric,
      null
    );
  end if;

  if v_model.input_tiers is not null and jsonb_array_length(v_model.input_tiers) > 0 then
    for v_tier in select * from jsonb_array_elements(v_model.input_tiers)
    loop
      v_tier_cost := (v_tier ->> 'cost')::numeric;
      v_tier_min := coalesce((v_tier ->> 'min')::integer, 0);
      v_tier_max := (v_tier ->> 'max')::integer;
      if coalesce(p_input_tokens, 0) >= v_tier_min and
         (v_tier_max is null or coalesce(p_input_tokens, 0) <= v_tier_max) then
        v_input_cost := coalesce(p_input_tokens, 0)::numeric * v_tier_cost;
        exit;
      end if;
    end loop;
  else
    v_input_cost := coalesce(p_input_tokens, 0)::numeric * v_model.input_price_per_token;
  end if;

  if v_model.output_tiers is not null and jsonb_array_length(v_model.output_tiers) > 0 then
    for v_tier in select * from jsonb_array_elements(v_model.output_tiers)
    loop
      v_tier_cost := (v_tier ->> 'cost')::numeric;
      v_tier_min := coalesce((v_tier ->> 'min')::integer, 0);
      v_tier_max := (v_tier ->> 'max')::integer;
      if coalesce(p_output_tokens, 0) >= v_tier_min and
         (v_tier_max is null or coalesce(p_output_tokens, 0) <= v_tier_max) then
        v_output_cost := coalesce(p_output_tokens, 0)::numeric * v_tier_cost;
        exit;
      end if;
    end loop;
  else
    v_output_cost := coalesce(p_output_tokens, 0)::numeric * v_model.output_price_per_token;
  end if;

  v_reasoning_cost := coalesce(p_reasoning_tokens, 0)::numeric * v_model.output_price_per_token;
  v_image_cost := coalesce(v_model.image_gen_price, 0) * coalesce(p_image_count, 0);
  v_search_cost := coalesce(v_model.search_price, 0) * coalesce(p_search_count, 0);

  return v_input_cost + v_output_cost + v_reasoning_cost + v_image_cost + v_search_cost;
end;
$$;

create or replace function public.check_ai_credit_allowance(
  p_ws_id uuid,
  p_model_id text,
  p_feature text,
  p_estimated_input_tokens integer default null,
  p_user_id uuid default null
)
returns table (
  allowed boolean,
  remaining_credits numeric,
  tier text,
  max_output_tokens integer,
  error_code text,
  error_message text
)
language plpgsql
volatile
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_tier workspace_product_tier;
  v_allocation record;
  v_balance record;
  v_remaining numeric;
  v_model record;
  v_feature_access record;
  v_feature_exists boolean;
  v_daily_used numeric;
  v_daily_request_count integer;
  v_feature_daily_count integer;
  v_effective_max_output integer;
  v_estimated_cost numeric;
  v_included_remaining numeric;
  v_payg_remaining numeric;
begin
  v_tier := public._resolve_workspace_tier(p_ws_id);

  select * into v_allocation
    from public.ai_credit_plan_allocations
   where ai_credit_plan_allocations.tier = v_tier and is_active = true;

  if not found then
    return query select false, 0::numeric, v_tier::text, null::integer,
      'NO_ALLOCATION'::text, 'No credit allocation configured for this tier'::text;
    return;
  end if;

  if array_length(v_allocation.allowed_models, 1) > 0 then
    if not (p_model_id = any(v_allocation.allowed_models)) then
      if not exists (
        select 1 from unnest(v_allocation.allowed_models) as m
        where m = p_model_id or split_part(m, '/', 2) = p_model_id
           or p_model_id = split_part(m, '/', 2)
      ) then
        return query select false, 0::numeric, v_tier::text, null::integer,
          'MODEL_NOT_ALLOWED'::text,
          format('Model %s is not available on the %s plan', p_model_id, v_tier::text)::text;
        return;
      end if;
    end if;
  end if;

  select gm.max_tokens, gm.input_price_per_token, gm.output_price_per_token
    into v_model
    from private.ai_gateway_models gm
   where (gm.id = p_model_id or gm.id = 'google/' || p_model_id)
     and gm.is_enabled = true;

  select * into v_feature_access
    from public.ai_credit_feature_access fa
   where fa.tier = v_tier and fa.feature = p_feature;

  v_feature_exists := found;

  if v_feature_exists and not v_feature_access.enabled then
    return query select false, 0::numeric, v_tier::text, null::integer,
      'FEATURE_NOT_ALLOWED'::text,
      format('Feature %s is not available on the %s plan', p_feature, v_tier::text)::text;
    return;
  end if;

  select * into v_balance
    from public.get_or_create_credit_balance(p_ws_id, p_user_id);

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := v_included_remaining + coalesce(v_payg_remaining, 0);

  if v_remaining <= 0 then
    return query select false, v_remaining, v_tier::text, null::integer,
      'CREDITS_EXHAUSTED'::text,
      'AI credits have been used up'::text;
    return;
  end if;

  if v_allocation.daily_limit is not null then
    select coalesce(sum(abs(amount)), 0) into v_daily_used
      from public.ai_credit_transactions
     where balance_id = v_balance.id
       and transaction_type = 'deduction'
       and created_at >= date_trunc('day', now());

    if v_daily_used >= v_allocation.daily_limit then
      return query select false, v_remaining, v_tier::text, null::integer,
        'DAILY_LIMIT_REACHED'::text,
        'Daily AI credit limit has been reached'::text;
      return;
    end if;
  end if;

  if v_allocation.max_requests_per_day is not null then
    select count(*) into v_daily_request_count
      from public.ai_credit_transactions
     where balance_id = v_balance.id
       and transaction_type = 'deduction'
       and created_at >= date_trunc('day', now());

    if v_daily_request_count >= v_allocation.max_requests_per_day then
      return query select false, v_remaining, v_tier::text, null::integer,
        'DAILY_LIMIT_REACHED'::text,
        'Daily AI request limit has been reached'::text;
      return;
    end if;
  end if;

  if v_feature_exists and v_feature_access.max_requests_per_day is not null then
    select count(*) into v_feature_daily_count
      from public.ai_credit_transactions
     where balance_id = v_balance.id
       and transaction_type = 'deduction'
       and feature = p_feature
       and created_at >= date_trunc('day', now());

    if v_feature_daily_count >= v_feature_access.max_requests_per_day then
      return query select false, v_remaining, v_tier::text, null::integer,
        'DAILY_LIMIT_REACHED'::text,
        format('Daily limit for %s has been reached', p_feature)::text;
      return;
    end if;
  end if;

  v_effective_max_output := v_allocation.max_output_tokens_per_request;
  if v_model.max_tokens is not null then
    if v_effective_max_output is null then
      v_effective_max_output := v_model.max_tokens;
    else
      v_effective_max_output := least(v_effective_max_output, v_model.max_tokens);
    end if;
  end if;

  if p_estimated_input_tokens is not null and v_model.input_price_per_token is not null then
    v_estimated_cost := (
      p_estimated_input_tokens::numeric * v_model.input_price_per_token +
      coalesce(v_effective_max_output, 8192)::numeric * v_model.output_price_per_token
    ) / 0.0001 * v_allocation.markup_multiplier;

    if v_estimated_cost > v_remaining then
      return query select false, v_remaining, v_tier::text, v_effective_max_output,
        'CREDITS_EXHAUSTED'::text,
        'Insufficient credits for estimated request cost'::text;
      return;
    end if;
  end if;

  return query select true, v_remaining, v_tier::text, v_effective_max_output,
    null::text, null::text;
  return;
end;
$$;

create or replace function public.deduct_ai_credits(
  p_ws_id uuid,
  p_model_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer default 0,
  p_feature text default null,
  p_execution_id uuid default null,
  p_chat_message_id uuid default null,
  p_metadata jsonb default '{}',
  p_user_id uuid default null,
  p_image_count integer default 0,
  p_search_count integer default 0
)
returns table (
  success boolean,
  credits_deducted numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_balance record;
  v_cost_usd numeric;
  v_credits numeric;
  v_tier workspace_product_tier;
  v_markup numeric;
  v_new_total_used numeric;
  v_remaining numeric;
  v_included_remaining numeric;
  v_payg_remaining numeric;
  v_included_to_consume numeric;
  v_payg_to_consume numeric;
  v_payg_consumed numeric;
  v_metadata jsonb;
begin
  select * into v_balance
    from public.get_or_create_credit_balance(p_ws_id, p_user_id);

  if not found then
    return query select false, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  select * into v_balance
    from public.workspace_ai_credit_balances
   where id = v_balance.id
   for update;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  v_tier := public._resolve_workspace_tier(p_ws_id);

  select coalesce(markup_multiplier, 1.0) into v_markup
    from public.ai_credit_plan_allocations
   where tier = v_tier and is_active = true;

  if v_markup is null then
    v_markup := 1.0;
  end if;

  if coalesce(p_input_tokens, 0) < 0
    or coalesce(p_output_tokens, 0) < 0
    or coalesce(p_reasoning_tokens, 0) < 0
    or coalesce(p_image_count, 0) < 0
    or coalesce(p_search_count, 0) < 0 then
    raise exception 'deduct_ai_credits: negative usage input (in=%, out=%, reason=%, img=%, search=%)',
      p_input_tokens, p_output_tokens, p_reasoning_tokens, p_image_count, p_search_count;
  end if;

  v_cost_usd := private.compute_ai_cost_from_gateway(
    p_model_id,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_image_count,
    p_search_count
  );

  v_credits := (v_cost_usd / 0.0001) * v_markup;

  if v_credits < 1
    and (
      coalesce(p_input_tokens, 0)
      + coalesce(p_output_tokens, 0)
      + coalesce(p_reasoning_tokens, 0)
      + coalesce(p_image_count, 0)
      + coalesce(p_search_count, 0)
    ) > 0 then
    v_credits := 1;
  end if;

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);

  if (v_included_remaining + coalesce(v_payg_remaining, 0)) < v_credits then
    return query
    select
      false,
      0::numeric,
      (v_included_remaining + coalesce(v_payg_remaining, 0))::numeric,
      'INSUFFICIENT_CREDITS'::text;
    return;
  end if;

  v_included_to_consume := least(greatest(v_included_remaining, 0), v_credits);
  v_payg_to_consume := v_credits - v_included_to_consume;

  v_payg_consumed := 0;
  if v_payg_to_consume > 0 then
    v_payg_consumed := public._consume_payg_credits(p_ws_id, v_payg_to_consume);

    if v_payg_consumed < v_payg_to_consume then
      raise exception 'INSUFFICIENT_CREDITS: PAYG shortfall (needed=%, got=%)',
        v_payg_to_consume, v_payg_consumed;
    end if;
  end if;

  if v_included_to_consume > 0 then
    update public.workspace_ai_credit_balances
       set total_used = total_used + v_included_to_consume,
           updated_at = now()
     where id = v_balance.id
    returning total_used into v_new_total_used;
  else
    v_new_total_used := v_balance.total_used;
  end if;

  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := (v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used)
    + coalesce(v_payg_remaining, 0);

  v_metadata := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'credit_split',
      jsonb_build_object(
        'included', v_included_to_consume,
        'payg', v_payg_consumed
      )
    );

  insert into public.ai_credit_transactions
    (ws_id, user_id, balance_id, execution_id, chat_message_id,
     transaction_type, amount, cost_usd, model_id, feature,
     input_tokens, output_tokens, reasoning_tokens, image_count, search_count, metadata)
  values
    (case when v_balance.ws_id is not null then p_ws_id else null end,
     p_user_id, v_balance.id, p_execution_id, p_chat_message_id,
     'deduction', -v_credits, v_cost_usd, p_model_id, p_feature,
     p_input_tokens, p_output_tokens, p_reasoning_tokens, p_image_count, p_search_count, v_metadata);

  return query select true, v_credits, v_remaining, null::text;
  return;
end;
$$;

create or replace function public.reserve_metered_embedding_credits(
  p_ws_id uuid,
  p_user_id uuid,
  p_model_id text,
  p_input_tokens integer,
  p_feature text default 'embeddings',
  p_metadata jsonb default '{}'::jsonb,
  p_expires_in_seconds integer default 1800
)
returns table (
  success boolean,
  reservation_id uuid,
  credits_reserved numeric,
  cost_usd numeric,
  remaining_credits numeric,
  error_code text
)
language plpgsql
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_tier workspace_product_tier;
  v_allocation record;
  v_model record;
  v_feature_access record;
  v_balance record;
  v_cost_usd numeric;
  v_credits numeric;
  v_included_remaining numeric;
  v_payg_remaining numeric;
  v_included_to_consume numeric;
  v_payg_to_consume numeric;
  v_payg_consumed numeric := 0;
  v_pack record;
  v_take numeric;
  v_payg_purchases jsonb := '[]'::jsonb;
  v_new_total_used numeric;
  v_reservation_id uuid;
  v_remaining numeric;
begin
  if p_ws_id is null or coalesce(p_input_tokens, 0) <= 0 then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'INVALID_REQUEST'::text;
    return;
  end if;

  v_tier := public._resolve_workspace_tier(p_ws_id);

  select * into v_allocation
  from public.ai_credit_plan_allocations
  where tier = v_tier
    and is_active = true;

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_ALLOCATION'::text;
    return;
  end if;

  if array_length(v_allocation.allowed_models, 1) > 0 then
    if not exists (
      select 1
      from unnest(v_allocation.allowed_models) as allowed_model
      where allowed_model = p_model_id
        or allowed_model = split_part(p_model_id, '/', 2)
        or split_part(allowed_model, '/', 2) = p_model_id
        or split_part(allowed_model, '/', 2) = split_part(p_model_id, '/', 2)
    ) then
      return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'MODEL_NOT_ALLOWED'::text;
      return;
    end if;
  end if;

  select * into v_feature_access
  from public.ai_credit_feature_access
  where tier = v_tier
    and feature = p_feature;

  if not found or not v_feature_access.enabled then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'FEATURE_NOT_ALLOWED'::text;
    return;
  end if;

  select * into v_model
  from private.ai_gateway_models
  where id = p_model_id
    and type = 'embedding'
    and is_enabled = true;

  if not found or coalesce(v_model.input_price_per_token, 0) <= 0 then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'MODEL_PRICING_UNAVAILABLE'::text;
    return;
  end if;

  select * into v_balance
  from public.get_or_create_credit_balance(p_ws_id, p_user_id);

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  perform public._release_expired_embedding_credit_reservations(v_balance.id);

  select * into v_balance
  from public.workspace_ai_credit_balances
  where id = v_balance.id
  for update;

  if not found then
    return query select false, null::uuid, 0::numeric, 0::numeric, 0::numeric, 'NO_BALANCE'::text;
    return;
  end if;

  v_cost_usd := private.compute_ai_cost_from_gateway(
    p_model_id,
    p_input_tokens,
    0,
    0,
    0,
    0
  );
  v_credits := (v_cost_usd / 0.0001) * coalesce(v_allocation.markup_multiplier, 1.0);

  if v_credits < 1 then
    v_credits := 1;
  end if;

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);

  if (v_included_remaining + coalesce(v_payg_remaining, 0)) < v_credits then
    return query
    select false, null::uuid, v_credits, v_cost_usd,
      (v_included_remaining + coalesce(v_payg_remaining, 0))::numeric,
      'INSUFFICIENT_CREDITS'::text;
    return;
  end if;

  v_included_to_consume := least(greatest(v_included_remaining, 0), v_credits);
  v_payg_to_consume := v_credits - v_included_to_consume;

  if v_payg_to_consume > 0 then
    for v_pack in
      select id, tokens_remaining
      from public.workspace_credit_pack_purchases
      where ws_id = p_ws_id
        and status = 'active'
        and expires_at > now()
        and tokens_remaining > 0
      order by expires_at asc, granted_at asc, created_at asc
      for update
    loop
      exit when v_payg_to_consume <= 0;
      v_take := least(v_pack.tokens_remaining, v_payg_to_consume);

      update public.workspace_credit_pack_purchases
      set tokens_remaining = tokens_remaining - v_take,
          status = case when tokens_remaining - v_take <= 0 then 'canceled' else 'active' end,
          updated_at = now()
      where id = v_pack.id;

      v_payg_to_consume := v_payg_to_consume - v_take;
      v_payg_consumed := v_payg_consumed + v_take;
      v_payg_purchases := v_payg_purchases || jsonb_build_array(
        jsonb_build_object('id', v_pack.id, 'amount', v_take)
      );
    end loop;

    if v_payg_to_consume > 0 then
      raise exception 'INSUFFICIENT_CREDITS: PAYG shortfall';
    end if;
  end if;

  if v_included_to_consume > 0 then
    update public.workspace_ai_credit_balances
    set total_used = total_used + v_included_to_consume,
        updated_at = now()
    where id = v_balance.id
    returning total_used into v_new_total_used;
  else
    v_new_total_used := v_balance.total_used;
  end if;

  insert into private.ai_embedding_credit_reservations (
    ws_id,
    user_id,
    balance_id,
    amount,
    included_amount,
    payg_amount,
    payg_purchases,
    model_id,
    feature,
    input_tokens,
    cost_usd,
    status,
    metadata,
    expires_at
  )
  values (
    p_ws_id,
    p_user_id,
    v_balance.id,
    v_credits,
    v_included_to_consume,
    v_payg_consumed,
    v_payg_purchases,
    p_model_id,
    p_feature,
    p_input_tokens,
    v_cost_usd,
    'reserved',
    coalesce(p_metadata, '{}'::jsonb),
    now() + make_interval(secs => greatest(coalesce(p_expires_in_seconds, 1800), 60))
  )
  returning id into v_reservation_id;

  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := (v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used)
    + coalesce(v_payg_remaining, 0);

  return query
  select true, v_reservation_id, v_credits, v_cost_usd, v_remaining, null::text;
end;
$$;

revoke execute on function private.prevent_disabling_default_ai_gateway_models()
  from public, anon, authenticated;
grant execute on function private.prevent_disabling_default_ai_gateway_models()
  to service_role;

revoke execute on function private.validate_ai_credit_plan_allocation_defaults()
  from public, anon, authenticated;
grant execute on function private.validate_ai_credit_plan_allocation_defaults()
  to service_role;

revoke execute on function private.compute_ai_cost_from_gateway(
  text,
  integer,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function private.compute_ai_cost_from_gateway(
  text,
  integer,
  integer,
  integer,
  integer,
  integer
) to service_role;

revoke execute on function public.check_ai_credit_allowance(
  uuid,
  text,
  text,
  integer,
  uuid
) from public, anon, authenticated;
grant execute on function public.check_ai_credit_allowance(
  uuid,
  text,
  text,
  integer,
  uuid
) to service_role;

revoke execute on function public.deduct_ai_credits(
  uuid,
  text,
  integer,
  integer,
  integer,
  text,
  uuid,
  uuid,
  jsonb,
  uuid,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.deduct_ai_credits(
  uuid,
  text,
  integer,
  integer,
  integer,
  text,
  uuid,
  uuid,
  jsonb,
  uuid,
  integer,
  integer
) to service_role;

revoke execute on function public.reserve_metered_embedding_credits(
  uuid,
  uuid,
  text,
  integer,
  text,
  jsonb,
  integer
) from public, anon, authenticated;
grant execute on function public.reserve_metered_embedding_credits(
  uuid,
  uuid,
  text,
  integer,
  text,
  jsonb,
  integer
) to service_role;

notify pgrst, 'reload schema';
