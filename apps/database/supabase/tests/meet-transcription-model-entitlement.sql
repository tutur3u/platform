-- Meet transcription model entitlement (#8460, D434): paid tiers carry the
-- Meet AI model, FREE does not, and the root workspace gets it only through
-- the internal staff-payer allowance for the 'generate' feature.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into public.users (id, display_name)
values ('84600000-0000-4000-8000-000000000001', 'Meet entitlement owner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  ('84600000-0000-4000-8000-000000000010', 'Meet entitlement free',
   '84600000-0000-4000-8000-000000000001', false),
  ('84600000-0000-4000-8000-000000000011', 'Meet entitlement pro',
   '84600000-0000-4000-8000-000000000001', false),
  ('00000000-0000-0000-0000-000000000000', 'Tuturuuu',
   '84600000-0000-4000-8000-000000000001', false)
on conflict (id) do nothing;

-- Root must resolve to FREE here, as it does without a subscription.
update public.workspace_subscriptions set status = 'canceled'
where ws_id = '00000000-0000-0000-0000-000000000000';

insert into private.workspace_subscription_products (id, tier, pricing_model, name)
values ('84600000-0000-4000-8000-000000000019', 'PRO', 'seat_based', 'Meet entitlement plan');
insert into public.workspace_subscriptions (ws_id, polar_subscription_id, product_id, seat_count, status)
values ('84600000-0000-4000-8000-000000000011', 'meet-entitlement-pro',
        '84600000-0000-4000-8000-000000000019', 1, 'active');

select is(
  public._resolve_workspace_tier('00000000-0000-0000-0000-000000000000')::text,
  'FREE',
  'root without a subscription resolves to FREE'
);

select is(
  (select count(*)::int from public.ai_credit_plan_allocations
    where is_active
      and tier in ('PLUS', 'PRO', 'ENTERPRISE')
      and coalesce(array_length(allowed_models, 1), 0) > 0
      and not ('google/gemini-3.1-flash-lite' = any(allowed_models))),
  0,
  'every restricted paid allocation carries the Meet AI model'
);

-- FREE restricts models without the Meet AI model and disables generate;
-- PRO restricts models to the Meet AI model.
update public.ai_credit_plan_allocations
set allowed_models = array['google/gemini-2.5-flash'],
    daily_limit = null, max_requests_per_day = null
where tier = 'FREE' and is_active;
update public.ai_credit_plan_allocations
set allowed_models = array['google/gemini-3.1-flash-lite'],
    daily_limit = null, max_requests_per_day = null
where tier = 'PRO' and is_active;
insert into public.ai_credit_feature_access (tier, feature, enabled, max_requests_per_day)
values ('FREE', 'generate', false, null)
on conflict (tier, feature) do update set enabled = false;

-- Funded wallets, so only the plan gates decide.
do $$
begin
  perform public.get_or_create_credit_balance('84600000-0000-4000-8000-000000000010', null);
  perform public.get_or_create_credit_balance('84600000-0000-4000-8000-000000000011', null);
  perform public.get_or_create_credit_balance('00000000-0000-0000-0000-000000000000', null);
end;
$$;
update public.workspace_ai_credit_balances
set total_allocated = 100000, total_used = 0, bonus_credits = 0
where ws_id in (
  '84600000-0000-4000-8000-000000000010',
  '84600000-0000-4000-8000-000000000011',
  '00000000-0000-0000-0000-000000000000'
) and period_start = date_trunc('month', now());

create function pg_temp.allowance(p_ws uuid, p_model text, p_feature text)
returns table (allowed boolean, error_code text)
language sql as $$
  select c.allowed, c.error_code
  from public.check_ai_credit_allowance(p_ws, p_model, p_feature, null, null) c;
$$;

select is(
  (select error_code from pg_temp.allowance(
    '84600000-0000-4000-8000-000000000010', 'google/gemini-3.1-flash-lite', 'generate')),
  'MODEL_NOT_ALLOWED',
  'a FREE workspace is denied the Meet AI model'
);

select is(
  (select allowed from pg_temp.allowance(
    '84600000-0000-4000-8000-000000000011', 'google/gemini-3.1-flash-lite', 'generate')),
  true,
  'a PRO workspace is allowed the Meet AI model'
);

select is(
  (select allowed from pg_temp.allowance(
    '00000000-0000-0000-0000-000000000000', 'google/gemini-3.1-flash-lite', 'generate')),
  true,
  'the root staff payer is allowed the Meet AI model for generate'
);

select is(
  (select error_code from pg_temp.allowance(
    '00000000-0000-0000-0000-000000000000', 'google/gemini-3.1-flash-lite', 'chat')),
  'MODEL_NOT_ALLOWED',
  'the root allowance covers only the generate feature'
);

select is(
  (select error_code from pg_temp.allowance(
    '00000000-0000-0000-0000-000000000000', 'google/gemini-3-pro', 'generate')),
  'MODEL_NOT_ALLOWED',
  'the root allowance covers only the Meet AI model'
);

select is(
  private.ai_internal_payer_allows_model(
    '84600000-0000-4000-8000-000000000010', 'google/gemini-3.1-flash-lite', 'generate'),
  false,
  'the internal allowance never applies outside root'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.ai_internal_payer_allows_model(uuid, text, text)',
    'execute'
  ) and not has_function_privilege(
    'anon',
    'private.ai_internal_payer_allows_model(uuid, text, text)',
    'execute'
  ),
  'clients cannot execute the internal allowance helper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.check_ai_credit_allowance(uuid, text, text, integer, uuid)',
    'execute'
  ),
  'clients still cannot call the credit allowance check'
);

-- The Meet AI model must exist and be enabled in the gateway catalog, as in
-- production; fresh resets do not sync the catalog.
insert into private.ai_gateway_models (
  id, name, provider, type, max_tokens, input_price_per_token, output_price_per_token, is_enabled
) values (
  'google/gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'google', 'language', 8192,
  0.00000025, 0.0000015, true
)
on conflict (id) do update set is_enabled = true;

-- AI Studio reservation gate: first-party root use passes the plan gate,
-- an API key never inherits the internal allowance.
create temporary table studio_gate as
select
  private.ai_studio_model_allowed(
    '84600000-0000-4000-8000-000000000010', null, 'google/gemini-3.1-flash-lite'
  ) as free_ws,
  private.ai_studio_model_allowed(
    '84600000-0000-4000-8000-000000000011', null, 'google/gemini-3.1-flash-lite'
  ) as pro_ws,
  private.ai_studio_model_allowed(
    '00000000-0000-0000-0000-000000000000', null, 'google/gemini-3.1-flash-lite'
  ) as root_first_party,
  private.ai_studio_model_allowed(
    '00000000-0000-0000-0000-000000000000',
    '84600000-0000-4000-8000-0000000000ff',
    'google/gemini-3.1-flash-lite'
  ) as root_key;

select is((select free_ws from studio_gate), false,
  'the studio gate denies a FREE workspace the Meet AI model');
select is((select pro_ws from studio_gate), true,
  'the studio gate allows a PRO workspace the Meet AI model');
select is((select root_first_party from studio_gate), true,
  'first-party root use passes the studio plan gate');
select is((select root_key from studio_gate), false,
  'a root API key does not inherit the internal allowance');

select * from finish();
rollback;
