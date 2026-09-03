begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into public.users (id, display_name)
values (
  '31000000-0000-4000-8000-000000002001',
  'Metered reservation owner'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '31000000-0000-4000-8000-000000002010',
  'Metered reservation workspace',
  '31000000-0000-4000-8000-000000002001',
  false
)
on conflict (id) do nothing;

insert into public.workspace_ai_credit_balances (
  id,
  ws_id,
  user_id,
  period_start,
  period_end,
  total_allocated,
  total_used
)
values (
  '31000000-0000-4000-8000-000000002020',
  '31000000-0000-4000-8000-000000002010',
  null,
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month',
  100,
  10
);

insert into private.ai_credit_reservations (
  id,
  ws_id,
  user_id,
  balance_id,
  amount,
  model_id,
  feature,
  status,
  metadata
)
values (
  '31000000-0000-4000-8000-000000002030',
  '31000000-0000-4000-8000-000000002010',
  '31000000-0000-4000-8000-000000002001',
  '31000000-0000-4000-8000-000000002020',
  10,
  'google/gemini-3.1-flash-lite',
  'generate',
  'reserved',
  '{"source":"reservation-test"}'::jsonb
);

create temporary table metered_settlement_result as
select *
from public.settle_metered_ai_credit_reservation(
  p_reservation_id => '31000000-0000-4000-8000-000000002030',
  p_input_tokens => 1,
  p_output_tokens => 1,
  p_reasoning_tokens => 0,
  p_metadata => '{"surface":"teach"}'::jsonb
);

select is(
  (select success from metered_settlement_result),
  true,
  'metered reservation settlement succeeds'
);

select ok(
  (select credits_deducted from metered_settlement_result) between 1 and 10,
  'actual usage is positive and does not exceed the reservation'
);

select is(
  (select status from private.ai_credit_reservations
    where id = '31000000-0000-4000-8000-000000002030'),
  'committed',
  'the reservation is committed'
);

select is(
  (select amount from private.ai_credit_reservations
    where id = '31000000-0000-4000-8000-000000002030'),
  (select credits_deducted from metered_settlement_result),
  'the reservation records actual rather than maximum credits'
);

select is(
  (select total_used from public.workspace_ai_credit_balances
    where id = '31000000-0000-4000-8000-000000002020'),
  (select credits_deducted from metered_settlement_result),
  'the unused reservation is refunded atomically'
);

select is(
  (select count(*)::integer from public.ai_credit_transactions
    where metadata ->> 'reservation_id'
      = '31000000-0000-4000-8000-000000002030'),
  1,
  'actual usage has exactly one ledger entry'
);

update public.workspace_ai_credit_balances
set total_used = total_used + 10
where id = '31000000-0000-4000-8000-000000002020';

insert into private.ai_credit_reservations (
  id,
  ws_id,
  user_id,
  balance_id,
  amount,
  model_id,
  feature,
  status,
  metadata
)
values (
  '31000000-0000-4000-8000-000000002031',
  '31000000-0000-4000-8000-000000002010',
  '31000000-0000-4000-8000-000000002001',
  '31000000-0000-4000-8000-000000002020',
  10,
  'google/gemini-3.1-flash-lite',
  'generate',
  'reserved',
  '{"source":"zero-usage-test"}'::jsonb
);

create temporary table zero_usage_settlement_result as
select *
from public.settle_metered_ai_credit_reservation(
  p_reservation_id => '31000000-0000-4000-8000-000000002031',
  p_input_tokens => 0,
  p_output_tokens => 0,
  p_reasoning_tokens => 0,
  p_metadata => '{"surface":"teach"}'::jsonb
);

select is(
  (select success from zero_usage_settlement_result),
  true,
  'zero usage releases successfully'
);

select is(
  (select status from private.ai_credit_reservations
    where id = '31000000-0000-4000-8000-000000002031'),
  'released',
  'zero usage releases rather than commits the reservation'
);

select is(
  (select amount from private.ai_credit_reservations
    where id = '31000000-0000-4000-8000-000000002031'),
  10::numeric,
  'zero usage preserves the positive reserved amount for audit history'
);

select is(
  (select count(*)::integer from public.ai_credit_transactions
    where metadata ->> 'reservation_id'
      = '31000000-0000-4000-8000-000000002031'),
  0,
  'zero usage does not create a ledger charge'
);

insert into private.workspace_credit_packs (
  id,
  name,
  description,
  price,
  currency,
  tokens,
  expiry_days
)
values (
  '31000000-0000-4000-8000-000000002040',
  'Metered reservation test credits',
  'Credits used to verify expired settlement balances',
  100,
  'usd',
  25,
  30
);

insert into public.workspace_credit_pack_purchases (
  id,
  ws_id,
  credit_pack_id,
  polar_subscription_id,
  tokens_granted,
  tokens_remaining,
  expires_at,
  status
)
values (
  '31000000-0000-4000-8000-000000002041',
  '31000000-0000-4000-8000-000000002010',
  '31000000-0000-4000-8000-000000002040',
  'metered-reservation-expiry-test',
  25,
  25,
  now() + interval '30 days',
  'active'
);

update public.workspace_ai_credit_balances
set total_used = total_used + 10
where id = '31000000-0000-4000-8000-000000002020';

insert into private.ai_credit_reservations (
  id,
  ws_id,
  user_id,
  balance_id,
  amount,
  model_id,
  feature,
  status,
  expires_at,
  metadata
)
values (
  '31000000-0000-4000-8000-000000002032',
  '31000000-0000-4000-8000-000000002010',
  '31000000-0000-4000-8000-000000002001',
  '31000000-0000-4000-8000-000000002020',
  10,
  'google/gemini-3.1-flash-lite',
  'generate',
  'reserved',
  now() - interval '1 minute',
  '{"source":"expired-reservation-test"}'::jsonb
);

create temporary table expired_settlement_result as
select *
from public.settle_metered_ai_credit_reservation(
  p_reservation_id => '31000000-0000-4000-8000-000000002032',
  p_input_tokens => 1,
  p_output_tokens => 1,
  p_reasoning_tokens => 0,
  p_metadata => '{"surface":"teach"}'::jsonb
);

select is(
  (select success from expired_settlement_result),
  false,
  'expired reservation settlement fails'
);

select is(
  (select error_code from expired_settlement_result),
  'RESERVATION_EXPIRED',
  'expired reservation settlement returns its error code'
);

select is(
  (select remaining_credits from expired_settlement_result),
  (
    125 - (select credits_deducted from metered_settlement_result)
  )::numeric,
  'expired settlement returns released included and active PAYG credits'
);

select is(
  (select status from private.ai_credit_reservations
    where id = '31000000-0000-4000-8000-000000002032'),
  'expired',
  'expired settlement marks the reservation expired'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.settle_metered_ai_credit_reservation(uuid,integer,integer,integer,jsonb)',
    'execute'
  ),
  'anon cannot settle reservations'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.settle_metered_ai_credit_reservation(uuid,integer,integer,integer,jsonb)',
    'execute'
  ),
  'authenticated users cannot settle reservations'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.settle_metered_ai_credit_reservation(uuid,integer,integer,integer,jsonb)',
    'execute'
  ),
  'service role can settle reservations'
);

select * from finish();
rollback;
