begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

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
  '2026-09-01T00:00:00Z',
  '2026-10-01T00:00:00Z',
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
