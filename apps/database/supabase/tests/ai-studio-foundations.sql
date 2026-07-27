begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(30);

select ok(
  not exists (
    select 1
    from (
      values
        ('ai_studio_global_settings'),
        ('workspace_ai_studio_policies'),
        ('ai_studio_workspace_model_grants'),
        ('ai_studio_api_keys'),
        ('ai_studio_runs'),
        ('ai_studio_run_steps'),
        ('ai_studio_run_content'),
        ('ai_studio_usage'),
        ('ai_studio_prompts'),
        ('ai_studio_prompt_versions'),
        ('ai_studio_agents'),
        ('ai_studio_agent_versions'),
        ('ai_studio_curated_tools'),
        ('ai_studio_agent_version_tools'),
        ('ai_studio_datasets'),
        ('ai_studio_dataset_items'),
        ('ai_studio_evaluation_suites'),
        ('ai_studio_experiments'),
        ('ai_studio_evaluation_results')
    ) as relations(name)
    where to_regclass(format('private.%I', name)) is null
  ),
  'all AI Studio relations live in the private schema'
);

select ok(
  to_regclass('public.ai_studio_api_keys') is null,
  'AI-only credentials are not exposed through the public schema'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_studio_api_keys', 'select'),
  'authenticated users cannot read AI key hashes'
);

select ok(
  has_table_privilege('service_role', 'private.ai_studio_api_keys', 'select')
    and has_table_privilege('service_role', 'private.ai_studio_api_keys', 'insert')
    and has_table_privilege('service_role', 'private.ai_studio_api_keys', 'update')
    and has_table_privilege('service_role', 'private.ai_studio_api_keys', 'delete'),
  'service role owns AI key lifecycle'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.ai_studio_api_keys'::regclass
  ),
  'AI key table has RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.ai_studio_run_content'::regclass
  ),
  'captured content table has RLS enabled'
);

select is(
  (
    select globally_enabled
    from private.ai_studio_global_settings
    where singleton
  ),
  false,
  'AI Studio is globally disabled by default'
);

select is(
  (
    select workspace_default_enabled
    from private.ai_studio_global_settings
    where singleton
  ),
  false,
  'workspace inheritance is disabled by default'
);

select is(
  (
    select metadata_retention_days
    from private.ai_studio_global_settings
    where singleton
  ),
  365,
  'metadata retention defaults to 365 days'
);

select is(
  (
    select content_retention_days
    from private.ai_studio_global_settings
    where singleton
  ),
  30,
  'captured content retention defaults to 30 days'
);

select throws_ok(
  $$insert into private.ai_studio_api_keys
      (ws_id, name, prefix, secret_hash)
    values
      ('00000000-0000-0000-0000-000000000000', 'bad', 'sk-not-ai', 'hash')$$,
  null,
  null,
  'AI key prefixes must use ttr_ai_'
);

select throws_ok(
  $$insert into private.workspace_ai_studio_policies (ws_id, state)
    values ('00000000-0000-0000-0000-000000000000', 'sometimes')$$,
  null,
  null,
  'workspace policy state accepts only inherit, enabled, or disabled'
);

select ok(
  to_regprocedure(
    'private.begin_ai_studio_run(text,uuid,uuid,uuid,text,text,numeric,text,jsonb)'
  ) is not null,
  'atomic run reservation RPC exists'
);

select ok(
  to_regprocedure(
    'private.settle_ai_studio_run(uuid,text,numeric,numeric,integer,integer,integer,integer,integer,integer,integer,text,text,jsonb)'
  ) is not null,
  'exact settlement RPC exists'
);

select ok(
  to_regprocedure('private.cleanup_ai_studio_retention()') is not null,
  'retention cleanup RPC exists'
);

select ok(
  to_regprocedure(
    'private.calculate_ai_studio_usage_cost(uuid,text,integer,integer,integer,integer,integer)'
  ) is not null,
  'exact plan-aware usage costing RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.calculate_ai_studio_usage_cost(uuid,text,integer,integer,integer,integer,integer)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'private.calculate_ai_studio_usage_cost(uuid,text,integer,integer,integer,integer,integer)',
      'execute'
    ),
  'only service role can calculate exact AI Studio usage cost'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.begin_ai_studio_run(text,uuid,uuid,uuid,text,text,numeric,text,jsonb)',
    'execute'
  ),
  'authenticated users cannot invoke atomic reservation directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.begin_ai_studio_run(text,uuid,uuid,uuid,text,text,numeric,text,jsonb)',
    'execute'
  ),
  'service role can reserve AI Studio credits'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.settle_ai_studio_run(uuid,text,numeric,numeric,integer,integer,integer,integer,integer,integer,integer,text,text,jsonb)',
    'execute'
  ),
  'authenticated users cannot settle credits directly'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'ai_studio_runs_ws_created_idx'
  ),
  'workspace and time run index exists'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'ai_studio_runs_key_created_idx'
  ),
  'key and time run index exists'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'ai_studio_content_expiry_idx'
  ),
  'captured content expiry index exists'
);

select ok(
  not exists (
    select required.permission
    from (
      values
        ('use_ai_studio'),
        ('manage_ai_keys'),
        ('manage_ai_policy'),
        ('manage_ai_prompts'),
        ('manage_ai_agents'),
        ('manage_ai_evaluations'),
        ('view_ai_usage'),
        ('view_ai_logs')
    ) as required(permission)
    where not exists (
      select 1
      from unnest(enum_range(null::public.workspace_role_permission)) value
      where value::text = required.permission
    )
  ),
  'all dedicated AI Studio permissions exist'
);

select ok(
  to_regclass('private.legal_document_versions') is not null
    and to_regclass('private.legal_document_acceptances') is not null,
  'legal versions and acceptance evidence use protected private tables'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.legal_document_acceptances',
    'select'
  ),
  'authenticated clients cannot read legal acceptance evidence directly'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.legal_document_acceptances',
    'insert'
  ),
  'server APIs can record legal acceptance evidence'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'legal_acceptances_workspace_time_idx'
  ),
  'workspace legal acceptance history has a bounded time index'
);

select * from finish();

rollback;
