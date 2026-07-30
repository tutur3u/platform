begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

insert into public.users (id, display_name)
values (
  '30000000-0000-4000-8000-000000003001',
  'AI expiry cleanup owner'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '30000000-0000-4000-8000-000000003010',
  'AI expiry cleanup workspace',
  '30000000-0000-4000-8000-000000003001',
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
  '30000000-0000-4000-8000-000000003020',
  '30000000-0000-4000-8000-000000003010',
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
  '30000000-0000-4000-8000-000000003030',
  '30000000-0000-4000-8000-000000003010',
  'Expiry cleanup key',
  'ttr_ai_expiry_cleanup',
  'expiry-cleanup-secret-hash',
  6
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
  expires_at
)
values
  (
    '30000000-0000-4000-8000-000000003040',
    '30000000-0000-4000-8000-000000003010',
    '30000000-0000-4000-8000-000000003001',
    '30000000-0000-4000-8000-000000003020',
    4,
    'google/gemini-3.5-flash-lite',
    'responses',
    'reserved',
    now() - interval '1 minute'
  ),
  (
    '30000000-0000-4000-8000-000000003041',
    '30000000-0000-4000-8000-000000003010',
    '30000000-0000-4000-8000-000000003001',
    '30000000-0000-4000-8000-000000003020',
    2,
    'google/gemini-3.5-flash-lite',
    'responses',
    'expired',
    now() - interval '2 minutes'
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
  reserved_credits,
  status
)
values
  (
    '30000000-0000-4000-8000-000000003050',
    'ai-expiry-cleanup-reserved',
    '30000000-0000-4000-8000-000000003010',
    '30000000-0000-4000-8000-000000003030',
    '30000000-0000-4000-8000-000000003001',
    'google/gemini-3.5-flash-lite',
    'responses',
    '30000000-0000-4000-8000-000000003040',
    4,
    'reserved'
  ),
  (
    '30000000-0000-4000-8000-000000003051',
    'ai-expiry-cleanup-stranded',
    '30000000-0000-4000-8000-000000003010',
    '30000000-0000-4000-8000-000000003030',
    '30000000-0000-4000-8000-000000003001',
    'google/gemini-3.5-flash-lite',
    'responses',
    '30000000-0000-4000-8000-000000003041',
    2,
    'running'
  );

select public._release_expired_ai_credit_reservations(
  '30000000-0000-4000-8000-000000003020'
);

select is(
  (
    select total_used
    from public.workspace_ai_credit_balances
    where id = '30000000-0000-4000-8000-000000003020'
  ),
  0::numeric,
  'only the newly expired reservation is refunded'
);

select is(
  (
    select count(*)
    from private.ai_credit_reservations
    where id in (
      '30000000-0000-4000-8000-000000003040',
      '30000000-0000-4000-8000-000000003041'
    )
      and status = 'expired'
  ),
  2::bigint,
  'new and previously expired reservations retain expired status'
);

select is(
  (
    select count(*)
    from private.ai_studio_runs
    where id in (
      '30000000-0000-4000-8000-000000003050',
      '30000000-0000-4000-8000-000000003051'
    )
      and status = 'aborted'
  ),
  2::bigint,
  'linked reserved and running Studio runs are aborted'
);

select is(
  (
    select count(*)
    from private.ai_studio_runs
    where id in (
      '30000000-0000-4000-8000-000000003050',
      '30000000-0000-4000-8000-000000003051'
    )
      and completed_at is not null
      and error_class = 'reservation_expired'
  ),
  2::bigint,
  'expired runs receive completion and safe error metadata'
);

select is(
  (
    select credits_reserved
    from private.ai_studio_api_keys
    where id = '30000000-0000-4000-8000-000000003030'
  ),
  0::numeric,
  'API key reserved-credit counters release every aborted run'
);

select is(
  (
    select released_at is not null
    from private.ai_credit_reservations
    where id = '30000000-0000-4000-8000-000000003040'
  ),
  true,
  'newly expired reservation records its release timestamp'
);

select lives_ok(
  $$
    select public._release_expired_ai_credit_reservations(
      '30000000-0000-4000-8000-000000003020'
    )
  $$,
  'expiry reconciliation is idempotent'
);

select * from finish();

rollback;
