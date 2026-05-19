begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(27);

select ok(
  to_regclass('public.ai_models') is null,
  'ai_models is no longer in the public schema'
);

select ok(
  to_regclass('public.ai_providers') is null,
  'ai_providers is no longer in the public schema'
);

select ok(
  to_regclass('private.ai_models') is not null,
  'ai_models exists in the private schema'
);

select ok(
  to_regclass('private.ai_providers') is not null,
  'ai_providers exists in the private schema'
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
  not has_table_privilege('anon', 'private.ai_models', 'select'),
  'anon cannot select private legacy AI models'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_models', 'select'),
  'authenticated cannot select private legacy AI models'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_models', 'insert'),
  'authenticated cannot insert private legacy AI models'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_models', 'update'),
  'authenticated cannot update private legacy AI models'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_models', 'delete'),
  'authenticated cannot delete private legacy AI models'
);

select ok(
  has_table_privilege('service_role', 'private.ai_models', 'select'),
  'service role can select private legacy AI models'
);

select ok(
  has_table_privilege('service_role', 'private.ai_models', 'insert'),
  'service role can insert private legacy AI models'
);

select ok(
  has_table_privilege('service_role', 'private.ai_models', 'update'),
  'service role can update private legacy AI models'
);

select ok(
  has_table_privilege('service_role', 'private.ai_models', 'delete'),
  'service role can delete private legacy AI models'
);

select ok(
  not has_table_privilege('anon', 'private.ai_providers', 'select'),
  'anon cannot select private legacy AI providers'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_providers', 'select'),
  'authenticated cannot select private legacy AI providers'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_providers', 'insert'),
  'authenticated cannot insert private legacy AI providers'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_providers', 'update'),
  'authenticated cannot update private legacy AI providers'
);

select ok(
  not has_table_privilege('authenticated', 'private.ai_providers', 'delete'),
  'authenticated cannot delete private legacy AI providers'
);

select ok(
  has_table_privilege('service_role', 'private.ai_providers', 'select'),
  'service role can select private legacy AI providers'
);

select ok(
  has_table_privilege('service_role', 'private.ai_providers', 'insert'),
  'service role can insert private legacy AI providers'
);

select ok(
  has_table_privilege('service_role', 'private.ai_providers', 'update'),
  'service role can update private legacy AI providers'
);

select ok(
  has_table_privilege('service_role', 'private.ai_providers', 'delete'),
  'service role can delete private legacy AI providers'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'public_ai_models_provider_fkey'
      and conrelid = 'private.ai_models'::regclass
      and confrelid = 'private.ai_providers'::regclass
  ),
  'legacy AI models still reference private AI providers'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'public_workspace_ai_prompts_model_fkey'
      and conrelid = 'public.workspace_ai_prompts'::regclass
      and confrelid = 'private.ai_models'::regclass
  ),
  'workspace AI prompts still reference private legacy AI models'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_ai_executions_model_id_fkey'
      and conrelid = 'public.workspace_ai_executions'::regclass
      and confrelid = 'private.ai_models'::regclass
  ),
  'workspace AI executions still reference private legacy AI models'
);

select * from finish();

rollback;
