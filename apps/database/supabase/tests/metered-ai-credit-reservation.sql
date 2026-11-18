begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

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

insert into private.workspace_subscription_products (id, tier, pricing_model, name)
values ('31000000-0000-4000-8000-000000002019', 'PRO', 'seat_based', 'Metered reservation plan');

insert into public.workspace_subscriptions (ws_id, polar_subscription_id, product_id, seat_count, status)
values ('31000000-0000-4000-8000-000000002010', 'metered-hold-plan',
        '31000000-0000-4000-8000-000000002019', 1, 'active');

create function pg_temp.hold_credits() returns uuid language sql as $$
  select reservation_id from public.reserve_fixed_ai_credits(
    '31000000-0000-4000-8000-000000002010', '31000000-0000-4000-8000-000000002001',
    10, 'google/gemini-3.1-flash-lite', 'generate'
  ) where success;
$$;

-- Capture the RPC result in its own statement so subsequent queries see its writes.
create temporary table paid_request as select pg_temp.hold_credits() as id;
create temporary table paid_hold as select r.id, r.balance_id from private.ai_credit_reservations r
join paid_request p using (id);
update public.workspace_ai_credit_balances set total_allocated = 100, bonus_credits = 0
where id = (select balance_id from paid_hold);

-- The active plan changes while the hold is outstanding.
update public.workspace_subscriptions set status = 'canceled'
where polar_subscription_id = 'metered-hold-plan';
create temporary table free_wallet as select id from public.get_or_create_credit_balance(
  '31000000-0000-4000-8000-000000002010', '31000000-0000-4000-8000-000000002001'
);
update public.workspace_ai_credit_balances set total_allocated = 100, bonus_credits = 0
where id = (select id from free_wallet);

create temporary table metered_settlement_result as
select *
from public.settle_metered_ai_credit_reservation(
  p_reservation_id => (select id from paid_hold),
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
    where id = (select id from paid_hold)),
  'committed',
  'the reservation is committed'
);

select is(
  (select amount from private.ai_credit_reservations
    where id = (select id from paid_hold)),
  (select credits_deducted from metered_settlement_result),
  'the reservation records actual rather than maximum credits'
);

select is(
  (select total_used from public.workspace_ai_credit_balances
    where id = (select balance_id from paid_hold)),
  (select credits_deducted from metered_settlement_result),
  'the unused reservation is refunded atomically'
);

select is(
  (select count(*)::integer from public.ai_credit_transactions
    where metadata ->> 'reservation_id'
      = (select id::text from paid_hold)),
  1,
  'actual usage has exactly one ledger entry'
);

-- Restore the paid plan for zero-usage and expiry coverage on the same wallet.
update public.workspace_subscriptions set status = 'active'
where polar_subscription_id = 'metered-hold-plan';
create temporary table zero_request as select pg_temp.hold_credits() as id;

create temporary table zero_usage_settlement_result as
select *
from public.settle_metered_ai_credit_reservation(
  p_reservation_id => (select id from zero_request),
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
    where id = (select id from zero_request)),
  'released',
  'zero usage releases rather than commits the reservation'
);

select is(
  (select amount from private.ai_credit_reservations
    where id = (select id from zero_request)),
  10::numeric,
  'zero usage preserves the positive reserved amount for audit history'
);

select is(
  (select count(*)::integer from public.ai_credit_transactions
    where metadata ->> 'reservation_id'
      = (select id::text from zero_request)),
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

create temporary table expired_request as select pg_temp.hold_credits() as id;
update private.ai_credit_reservations set expires_at = now() - interval '1 second'
where id = (select id from expired_request);

create temporary table expired_settlement_result as
select *
from public.settle_metered_ai_credit_reservation(
  p_reservation_id => (select id from expired_request),
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
    where id = (select id from expired_request)),
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

select is((select b.ws_id from public.workspace_ai_credit_balances b join paid_hold h on b.id = h.balance_id),
  '31000000-0000-4000-8000-000000002010'::uuid, 'paid reserve selects the workspace wallet');
select is((select total_used from public.workspace_ai_credit_balances where id = (select id from free_wallet)),
  0::numeric, 'tier change leaves the actor wallet untouched');
select is((select remaining_credits from metered_settlement_result),
  100 - (select credits_deducted from metered_settlement_result), 'settlement returns the reserved wallet balance');
select is((select balance_id from public.ai_credit_transactions where metadata ->> 'reservation_id' = (select id::text from paid_hold)),
  (select balance_id from paid_hold), 'ledger debit belongs to the paid hold');
select results_eq(
  $$select ws_id, user_id, metadata -> 'credit_split' from public.ai_credit_transactions
    where metadata ->> 'reservation_id' = (select id::text from paid_hold)$$,
  $$select '31000000-0000-4000-8000-000000002010'::uuid, '31000000-0000-4000-8000-000000002001'::uuid,
           jsonb_build_object('included', credits_deducted, 'payg', 0) from metered_settlement_result$$,
  'workspace debit retains the actor, workspace and credit split'
);

update public.workspace_subscriptions set status = 'canceled'
where polar_subscription_id = 'metered-hold-plan';
create temporary table free_request as select pg_temp.hold_credits() as id;
select is((select balance_id from private.ai_credit_reservations where id = (select id from free_request)),
  (select id from free_wallet), 'FREE reserve selects the actor wallet');

-- Simulate the billing-period boundary while the short-lived hold is still valid.
update public.workspace_ai_credit_balances
set period_end = period_start, period_start = period_start - interval '1 month'
where id = (select id from free_wallet);
create temporary table next_wallet as select id from public.get_or_create_credit_balance(
  '31000000-0000-4000-8000-000000002010', '31000000-0000-4000-8000-000000002001'
);
select isnt((select id from next_wallet), (select id from free_wallet), 'new period has a distinct wallet');

create temporary table period_charge as select * from public.settle_metered_ai_credit_reservation(
  (select id from free_request), 1, 1, 0
);
select is((select success from period_charge), true, 'previous period hold settles successfully');
create temporary table period_replay as select * from public.settle_metered_ai_credit_reservation(
  (select id from free_request), 1, 1, 0
);
select results_eq('select * from period_replay','select * from period_charge',
  'committed replay returns the same debit and available balance');
select is((select total_used from public.workspace_ai_credit_balances where id = (select id from free_wallet)),
  (select credits_deducted from period_charge), 'original period wallet bears one charge after replay');
select is((select total_used from public.workspace_ai_credit_balances where id = (select id from next_wallet)),
  0::numeric, 'next period wallet stays untouched after replay');
select results_eq(
  $$select balance_id from public.ai_credit_transactions where transaction_type = 'deduction'
      and metadata ->> 'reservation_id' = (select id::text from free_request)$$,
  'select id from free_wallet', 'exactly one ledger debit on the held wallet after replay'
);
select ok(not has_function_privilege('service_role',
  'private.deduct_ai_credits_from_balance(uuid,uuid,text,integer,integer,integer,text,uuid,uuid,jsonb,uuid,integer,integer)',
  'execute'), 'explicit balance selection is internal to the billing functions');

-- A failed deduction must restore the outstanding hold and leave no ledger entry.
update public.workspace_ai_credit_balances set total_allocated = 100
where id = (select id from next_wallet);
create temporary table insufficient_request as select pg_temp.hold_credits() as id;
update public.workspace_ai_credit_balances set total_allocated = 0, bonus_credits = 0
where id = (select id from next_wallet);
update public.workspace_credit_pack_purchases set status = 'canceled'
where polar_subscription_id = 'metered-reservation-expiry-test';
select throws_ok(
  $$select * from public.settle_metered_ai_credit_reservation(
    (select id from insufficient_request), 1, 1, 0)$$,
  'P0001', 'METERED_RESERVATION_SETTLEMENT_FAILED', 'failed charge rolls back settlement'
);
select is((select total_used from public.workspace_ai_credit_balances where id = (select id from next_wallet)),
  10::numeric, 'failed charge preserves the full hold');
select is((select status from private.ai_credit_reservations where id = (select id from insufficient_request)),
  'reserved', 'failed charge leaves the reservation available for retry');
select is((select count(*) from public.ai_credit_transactions where metadata ->> 'reservation_id' =
  (select id::text from insufficient_request)), 0::bigint, 'failed charge emits no deduction');

select * from finish();
rollback;
