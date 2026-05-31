begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(32);

select ok(
  to_regclass('public.ai_gateway_models') is null,
  'AI gateway models are no longer in the public schema'
);

select ok(
  to_regclass('private.ai_gateway_models') is not null,
  'AI gateway models exist in the private schema'
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
  has_schema_privilege('service_role', 'private', 'usage'),
  'service role can use the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      'private.ai_gateway_models',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private AI gateway models'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      'private.ai_gateway_models',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private AI gateway models'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      'private.ai_gateway_models',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private AI gateway models'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.ai_gateway_models'::regclass
  ),
  'private AI gateway models have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'ai_gateway_models'
      and policyname = 'Service role can manage private AI gateway models'
  ),
  'private AI gateway models have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'ai_gateway_models'
      and policyname = 'ai_gateway_models_select_authenticated'
  ),
  'old authenticated model-catalog policy was removed'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'ai_gateway_models'
      and (
        'anon' = any (roles)
        or 'authenticated' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private AI gateway model policies do not grant anon/authenticated/public access'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'ai_credit_plan_allocations_default_language_model_fkey'
      and conrelid = 'public.ai_credit_plan_allocations'::regclass
      and confrelid = 'private.ai_gateway_models'::regclass
  ),
  'default language model foreign key targets private AI gateway models'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'ai_credit_plan_allocations_default_image_model_fkey'
      and conrelid = 'public.ai_credit_plan_allocations'::regclass
      and confrelid = 'private.ai_gateway_models'::regclass
  ),
  'default image model foreign key targets private AI gateway models'
);

select ok(
  to_regprocedure('private.prevent_disabling_default_ai_gateway_models()') is not null,
  'default-model protection trigger function lives in private schema'
);

select ok(
  to_regprocedure('public.prevent_disabling_default_ai_gateway_models()') is null,
  'default-model protection trigger function is not exposed in public schema'
);

select ok(
  to_regprocedure('private.validate_ai_credit_plan_allocation_defaults()') is not null,
  'plan default-model validator lives in private schema'
);

select ok(
  to_regprocedure('public.validate_ai_credit_plan_allocation_defaults()') is null,
  'plan default-model validator is not exposed in public schema'
);

select ok(
  to_regprocedure('private.compute_ai_cost_from_gateway(text,integer,integer,integer,integer,integer)') is not null,
  'gateway model cost helper lives in private schema'
);

select ok(
  to_regprocedure('public.compute_ai_cost_from_gateway(text,integer,integer,integer,integer,integer)') is null,
  'gateway model cost helper is not exposed in public schema'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.compute_ai_cost_from_gateway(text,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'service role can execute the private gateway model cost helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.compute_ai_cost_from_gateway(text,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'anon cannot execute the private gateway model cost helper'
);

select ok(
  to_regprocedure('public.check_ai_credit_allowance(uuid,text,text,integer,uuid)') is not null,
  'credit allowance RPC remains available for service-owned app routes'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.check_ai_credit_allowance(uuid,text,text,integer,uuid)',
    'execute'
  ),
  'authenticated users cannot execute the credit allowance RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.check_ai_credit_allowance(uuid,text,text,integer,uuid)',
    'execute'
  ),
  'service role can execute the credit allowance RPC'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and case
        when p.prokind in ('f', 'p', 'w') then
          pg_get_functiondef(p.oid) like '%public.ai_gateway_models%'
        else false
      end
  ),
  'database functions no longer reference public.ai_gateway_models'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_proc proc_row
      on proc_row.oid = trigger_row.tgfoid
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where trigger_row.tgname = 'validate_ai_credit_plan_allocation_defaults_trigger'
      and trigger_row.tgrelid = 'public.ai_credit_plan_allocations'::regclass
      and proc_schema.nspname = 'private'
      and proc_row.proname = 'validate_ai_credit_plan_allocation_defaults'
  ),
  'plan allocations validate defaults with the private trigger function'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_proc proc_row
      on proc_row.oid = trigger_row.tgfoid
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where trigger_row.tgname = 'prevent_disabling_default_ai_gateway_models_trigger'
      and trigger_row.tgrelid = 'private.ai_gateway_models'::regclass
      and proc_schema.nspname = 'private'
      and proc_row.proname = 'prevent_disabling_default_ai_gateway_models'
  ),
  'AI gateway models protect plan defaults with the private trigger function'
);

insert into private.ai_gateway_models (
  id,
  name,
  provider,
  type,
  max_tokens,
  input_price_per_token,
  output_price_per_token,
  image_gen_price,
  search_price,
  is_enabled
)
values
  ('pgtap/language', 'pgTAP Language Model', 'pgtap', 'language', 4096, 0.000001, 0.000002, null, null, true),
  ('pgtap/image', 'pgTAP Image Model', 'pgtap', 'image', null, 0, 0, 0.03, null, true),
  ('pgtap/cost', 'pgTAP Cost Model', 'pgtap', 'language', 4096, 0.000001, 0.000002, 0.03, 0.04, true)
on conflict (id) do update
set
  name = excluded.name,
  provider = excluded.provider,
  type = excluded.type,
  max_tokens = excluded.max_tokens,
  input_price_per_token = excluded.input_price_per_token,
  output_price_per_token = excluded.output_price_per_token,
  image_gen_price = excluded.image_gen_price,
  search_price = excluded.search_price,
  is_enabled = excluded.is_enabled;

select is(
  round(private.compute_ai_cost_from_gateway('pgtap/cost', 100, 20, 10, 2, 1), 6),
  0.100160::numeric,
  'private gateway model cost helper computes token, image, and search costs'
);

select lives_ok(
  $$ update public.ai_credit_plan_allocations
     set default_language_model = 'pgtap/language',
         default_image_model = 'pgtap/image',
         allowed_models = array['pgtap/language', 'pgtap/image']
     where tier = 'FREE' $$,
  'plan allocation defaults can reference private gateway models'
);

select throws_ok(
  $$ update private.ai_gateway_models
     set is_enabled = false
     where id = 'pgtap/language' $$,
  null,
  'private default-model trigger prevents disabling active plan defaults'
);

select throws_ok(
  $$ update public.ai_credit_plan_allocations
     set default_language_model = 'pgtap/image',
         allowed_models = array['pgtap/image']
     where tier = 'FREE' $$,
  null,
  'private plan validator rejects default language models with an image type'
);

select * from finish();

rollback;
