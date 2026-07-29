begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

insert into public.users (id, display_name)
values
  (
    '30000000-0000-4000-8000-000000001001',
    'AI observability owner'
  ),
  (
    '30000000-0000-4000-8000-000000001002',
    'AI observability tenant'
  )
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  (
    '30000000-0000-4000-8000-000000001010',
    'AI observability workspace',
    '30000000-0000-4000-8000-000000001001',
    false
  ),
  (
    '30000000-0000-4000-8000-000000001011',
    'Other AI observability workspace',
    '30000000-0000-4000-8000-000000001002',
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
values
  (
    '30000000-0000-4000-8000-000000001020',
    '30000000-0000-4000-8000-000000001010',
    null,
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    100,
    5
  ),
  (
    '30000000-0000-4000-8000-000000001021',
    null,
    '30000000-0000-4000-8000-000000001001',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    100,
    10
  ),
  (
    '30000000-0000-4000-8000-000000001022',
    '30000000-0000-4000-8000-000000001011',
    null,
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z',
    100,
    11
  )
on conflict (id) do nothing;

insert into private.ai_studio_runs (
  id,
  request_id,
  ws_id,
  actor_id,
  model_id,
  feature,
  status,
  billed_credits,
  provider_cost_usd,
  input_tokens,
  output_tokens,
  reasoning_tokens,
  embedding_units,
  image_units,
  latency_ms,
  metadata,
  completed_at,
  created_at
)
values
  (
    '30000000-0000-4000-8000-000000001030',
    'ai-observability-studio-run',
    '30000000-0000-4000-8000-000000001010',
    '30000000-0000-4000-8000-000000001001',
    'google/gemini-studio',
    'studio-chat',
    'succeeded',
    3,
    0.0003,
    30,
    3,
    1,
    0,
    0,
    120,
    '{}'::jsonb,
    '2026-07-15T10:00:01Z',
    '2026-07-15T10:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000001031',
    'ai-observability-external-run',
    '30000000-0000-4000-8000-000000001010',
    null,
    'google/gemini-external',
    'external-tts',
    'succeeded',
    0,
    0.004,
    40,
    4,
    0,
    0,
    1,
    80,
    '{"external_app_id":"registered-app"}'::jsonb,
    '2026-07-16T10:00:01Z',
    '2026-07-16T10:00:00Z'
  )
on conflict (id) do nothing;

insert into public.ai_credit_transactions (
  id,
  ws_id,
  user_id,
  balance_id,
  transaction_type,
  amount,
  cost_usd,
  model_id,
  feature,
  input_tokens,
  output_tokens,
  reasoning_tokens,
  image_count,
  search_count,
  metadata,
  created_at
)
values
  (
    '30000000-0000-4000-8000-000000001040',
    '30000000-0000-4000-8000-000000001010',
    null,
    '30000000-0000-4000-8000-000000001020',
    'deduction',
    -5,
    0.0005,
    'google/gemini-workspace',
    'chat',
    10,
    1,
    0,
    0,
    2,
    '{"prompt":"must never be returned"}'::jsonb,
    '2026-07-13T10:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000001041',
    null,
    '30000000-0000-4000-8000-000000001001',
    '30000000-0000-4000-8000-000000001021',
    'deduction',
    -7,
    0.0007,
    'google/gemini-personal',
    'image-generation',
    20,
    2,
    0,
    3,
    0,
    '{}'::jsonb,
    '2026-07-14T10:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000001042',
    null,
    '30000000-0000-4000-8000-000000001001',
    '30000000-0000-4000-8000-000000001021',
    'deduction',
    -3,
    0.0003,
    'google/gemini-studio',
    'studio-chat',
    30,
    3,
    1,
    0,
    0,
    '{"run_id":"30000000-0000-4000-8000-000000001030"}'::jsonb,
    '2026-07-15T10:00:01Z'
  ),
  (
    '30000000-0000-4000-8000-000000001043',
    '30000000-0000-4000-8000-000000001011',
    null,
    '30000000-0000-4000-8000-000000001022',
    'deduction',
    -11,
    0.0011,
    'google/gemini-other',
    'chat',
    50,
    5,
    0,
    0,
    0,
    '{}'::jsonb,
    '2026-07-17T10:00:00Z'
  )
on conflict (id) do nothing;

select ok(
  to_regprocedure(
    'private.get_ai_studio_consumption_breakdown(uuid,uuid,timestamp with time zone,timestamp with time zone)'
  ) is not null,
  'combined AI consumption aggregation RPC exists'
);

select ok(
  to_regprocedure(
    'private.list_ai_studio_consumption_events(uuid,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid,text,text,text)'
  ) is not null,
  'combined AI consumption event RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_ai_studio_consumption_breakdown(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'private.get_ai_studio_consumption_breakdown(uuid,uuid,timestamp with time zone,timestamp with time zone)',
      'execute'
    ),
  'only service role can aggregate combined AI consumption'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.list_ai_studio_consumption_events(uuid,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid,text,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'private.list_ai_studio_consumption_events(uuid,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid,text,text,text)',
      'execute'
    ),
  'only service role can list combined AI consumption events'
);

select is(
  (
    select sum(request_count)::bigint
    from private.get_ai_studio_consumption_breakdown(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z'
    )
  ),
  4::bigint,
  'combined aggregation includes workspace, personal, Studio, and external events'
);

select is(
  (
    select sum(billed_credits)
    from private.get_ai_studio_consumption_breakdown(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z'
    )
  ),
  15::numeric,
  'combined aggregation reports actual billed credits without double counting'
);

select is(
  (
    select sum(provider_cost_usd)
    from private.get_ai_studio_consumption_breakdown(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z'
    )
  ),
  0.0055::numeric,
  'combined aggregation preserves settled provider cost'
);

select is(
  (
    select sum(request_count)::bigint
    from private.get_ai_studio_consumption_breakdown(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z'
    )
    where source_type = 'workspace_credit'
  ),
  2::bigint,
  'workspace credit source includes workspace and personal ledger deductions'
);

select is(
  (
    select sum(search_units)::bigint
    from private.get_ai_studio_consumption_breakdown(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z'
    )
  ),
  2::bigint,
  'combined aggregation preserves search units'
);

select is(
  (
    select count(*)
    from private.list_ai_studio_consumption_events(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
      50,
      null,
      null,
      null,
      null,
      null
    )
  ),
  4::bigint,
  'combined event log excludes the duplicate Studio ledger deduction'
);

select is(
  (
    select count(*)
    from private.list_ai_studio_consumption_events(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
      50,
      null,
      null,
      null,
      null,
      'google/gemini-personal'
    )
  ),
  1::bigint,
  'combined event log applies model filters'
);

select is(
  (
    select billed_credits
    from private.list_ai_studio_consumption_events(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
      50,
      null,
      null,
      null,
      'external-tts',
      null
    )
  ),
  0::numeric,
  'registered external-app events retain zero billed workspace credits'
);

select is(
  (
    select provider_cost_usd
    from private.list_ai_studio_consumption_events(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
      50,
      null,
      null,
      null,
      'external-tts',
      null
    )
  ),
  0.004::numeric,
  'registered external-app events retain actual provider cost'
);

select is(
  (
    select count(*)
    from private.list_ai_studio_consumption_events(
      '30000000-0000-4000-8000-000000001011',
      '30000000-0000-4000-8000-000000001002',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
      50,
      null,
      null,
      null,
      null,
      null
    )
  ),
  1::bigint,
  'combined event log remains tenant isolated'
);

select is(
  (
    select count(*)
    from private.list_ai_studio_consumption_events(
      '30000000-0000-4000-8000-000000001010',
      '30000000-0000-4000-8000-000000001001',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
      1,
      null,
      null,
      null,
      null,
      null
    )
  ),
  1::bigint,
  'combined event log applies bounded pagination'
);

select * from finish();

rollback;
