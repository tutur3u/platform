begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into public.users (id, display_name)
values (
  '30000000-0000-4000-8000-000000002001',
  'AI zero settlement owner'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '30000000-0000-4000-8000-000000002010',
  'AI zero settlement workspace',
  '30000000-0000-4000-8000-000000002001',
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
  '30000000-0000-4000-8000-000000002020',
  '30000000-0000-4000-8000-000000002010',
  null,
  '2026-07-01T00:00:00Z',
  '2026-08-01T00:00:00Z',
  100,
  4
);

insert into private.ai_studio_api_keys (
  id,
  ws_id,
  name,
  prefix,
  secret_hash,
  credits_reserved
)
values (
  '30000000-0000-4000-8000-000000002030',
  '30000000-0000-4000-8000-000000002010',
  'Zero settlement key',
  'ttr_ai_zero_settlement',
  'zero-settlement-secret-hash',
  4
);

insert into private.ai_credit_reservations (
  id,
  ws_id,
  user_id,
  balance_id,
  amount,
  model_id,
  feature,
  status
)
values (
  '30000000-0000-4000-8000-000000002040',
  '30000000-0000-4000-8000-000000002010',
  '30000000-0000-4000-8000-000000002001',
  '30000000-0000-4000-8000-000000002020',
  4,
  'google/gemini-3.5-flash-lite',
  'responses',
  'reserved'
);

insert into private.ai_studio_runs (
  id,
  request_id,
  ws_id,
  api_key_id,
  actor_id,
  model_id,
  feature,
  reservation_id,
  reserved_credits
)
values (
  '30000000-0000-4000-8000-000000002050',
  'ai-zero-credit-settlement',
  '30000000-0000-4000-8000-000000002010',
  '30000000-0000-4000-8000-000000002030',
  '30000000-0000-4000-8000-000000002001',
  'google/gemini-3.5-flash-lite',
  'responses',
  '30000000-0000-4000-8000-000000002040',
  4
);

create temporary table zero_settlement_result as
select *
from private.settle_ai_studio_run(
  p_run_id => '30000000-0000-4000-8000-000000002050',
  p_status => 'failed',
  p_actual_credits => 0,
  p_error_class => 'GatewayInternalServerError',
  p_error_message => 'Provider request failed.',
  p_metadata => '{"source":"test"}'::jsonb
);

select is(
  (select success from zero_settlement_result),
  true,
  'zero-credit settlement succeeds'
);

select is(
  (
    select total_used
    from public.workspace_ai_credit_balances
    where id = '30000000-0000-4000-8000-000000002020'
  ),
  0::numeric,
  'zero-credit settlement fully refunds the reserved balance'
);

select is(
  (
    select status
    from private.ai_credit_reservations
    where id = '30000000-0000-4000-8000-000000002040'
  ),
  'released',
  'zero-credit reservation is released instead of committed'
);

select is(
  (
    select amount
    from private.ai_credit_reservations
    where id = '30000000-0000-4000-8000-000000002040'
  ),
  4::numeric,
  'released reservation preserves its positive audit amount'
);

select ok(
  (
    select released_at is not null and committed_at is null
    from private.ai_credit_reservations
    where id = '30000000-0000-4000-8000-000000002040'
  ),
  'released reservation records the correct lifecycle timestamp'
);

select ok(
  (
    select
      status = 'failed'
      and billed_credits = 0
      and error_class = 'GatewayInternalServerError'
    from private.ai_studio_runs
    where id = '30000000-0000-4000-8000-000000002050'
  ),
  'failed run is settled with sanitized failure metadata'
);

select ok(
  (
    select credits_reserved = 0 and credits_used = 0
    from private.ai_studio_api_keys
    where id = '30000000-0000-4000-8000-000000002030'
  ),
  'API key counters release the reservation without billing usage'
);

select is(
  (
    select billed_credits
    from private.ai_studio_usage
    where run_id = '30000000-0000-4000-8000-000000002050'
  ),
  0::numeric,
  'zero-credit failed run remains visible in usage history'
);

select is(
  (
    select count(*)
    from public.ai_credit_transactions
    where metadata ->> 'run_id' =
      '30000000-0000-4000-8000-000000002050'
  ),
  0::bigint,
  'zero-credit settlement does not add a deduction transaction'
);

select * from finish();

rollback;
