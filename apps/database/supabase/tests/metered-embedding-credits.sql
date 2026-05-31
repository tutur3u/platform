begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(14);

select ok(
  to_regclass('private.ai_embedding_credit_reservations') is not null,
  'embedding credit reservations live in private schema'
);

select ok(
  to_regclass('public.ai_embedding_credit_reservations') is null,
  'embedding credit reservations are not exposed in public schema'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.ai_embedding_credit_reservations'::regclass
  ),
  'private embedding credit reservations have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'ai_embedding_credit_reservations'
      and policyname = 'Service role can manage embedding credit reservations'
  ),
  'private embedding credit reservations have a service-role policy'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_embedding_credit_reservations',
    'select'
  ),
  'authenticated users cannot select private embedding reservations'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_embedding_credit_reservations',
    'insert'
  ),
  'service role can create private embedding reservations'
);

select ok(
  to_regprocedure(
    'public.reserve_metered_embedding_credits(uuid,uuid,text,integer,text,jsonb,integer)'
  ) is not null,
  'metered embedding reservation RPC exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_metered_embedding_credits(uuid,uuid,text,integer,text,jsonb,integer)',
    'execute'
  ),
  'authenticated users cannot reserve embedding credits directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.reserve_metered_embedding_credits(uuid,uuid,text,integer,text,jsonb,integer)',
    'execute'
  ),
  'service role can reserve embedding credits'
);

select ok(
  exists (
    select 1
    from public.ai_gateway_models
    where id = 'google/gemini-embedding-2'
      and type = 'embedding'
      and is_enabled
      and max_tokens = 3072
      and input_price_per_token > 0
  ),
  'Gemini Embedding 2 is seeded as a priced enabled embedding model'
);

select ok(
  exists (
    select 1
    from public.ai_credit_feature_access
    where feature = 'embeddings'
      and enabled
  ),
  'embeddings credit feature is enabled for at least one tier'
);

select ok(
  exists (
    select 1
    from public.ai_credit_plan_allocations
    where is_active
      and array_position(allowed_features, 'embeddings') is not null
  ),
  'active credit allocations include the embeddings feature'
);

select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = 'public.tasks'::regclass
      and attname = 'embedding'
      and format_type(atttypid, atttypmod) = 'halfvec(3072)'
  ),
  'task embeddings use halfvec(3072)'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'tasks'
      and indexname = 'tasks_embedding_hnsw_idx'
      and indexdef like '%USING hnsw%'
      and indexdef like '%halfvec_cosine_ops%'
  ),
  'task embeddings use an HNSW cosine index'
);

select * from finish();

rollback;
