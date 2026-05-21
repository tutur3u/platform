begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(21);

select ok(
  not exists (
    select 1
    from (
      values
        ('cross_app_tokens'),
        ('internal_email_api_keys')
    ) as tables(table_name)
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'auth credential tables are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('cross_app_tokens'),
        ('internal_email_api_keys')
    ) as tables(table_name)
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'auth credential tables exist in the private schema'
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
  not exists (
    select 1
    from (
      values
        ('cross_app_tokens'),
        ('internal_email_api_keys')
    ) as tables(table_name)
    where has_table_privilege('anon', format('private.%I', table_name), 'select')
  ),
  'anon cannot select private auth credential tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('cross_app_tokens'),
        ('internal_email_api_keys')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private auth credential tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('cross_app_tokens'),
        ('internal_email_api_keys')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'service role can select and mutate private auth credential tables'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.cross_app_tokens'::regclass
  ),
  'private cross-app tokens have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.internal_email_api_keys'::regclass
  ),
  'private internal email API keys have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'cross_app_tokens'
      and policyname = 'Service role can manage private cross-app tokens'
  ),
  'private cross-app tokens have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'internal_email_api_keys'
      and policyname = 'Service role can manage private internal email API keys'
  ),
  'private internal email API keys have a service-role policy'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.generate_cross_app_token(uuid,text,text,integer)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.generate_cross_app_token(uuid,text,text,integer,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.generate_cross_app_token(uuid,text,text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.generate_cross_app_token(uuid,text,text,integer,jsonb)',
    'execute'
  ),
  'cross-app token generators keep authenticated-only execute grants'
);

select ok(
  has_function_privilege(
    'anon',
    'public.validate_cross_app_token_with_session(text,text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.validate_cross_app_token_with_session(text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.validate_cross_app_token_with_session(text,text)',
    'execute'
  ),
  'cross-app token validation remains callable through the existing public RPC'
);

select ok(
  not exists (
    select 1
    from pg_proc
    where oid in (
      'public.cleanup_expired_cross_app_tokens()'::regprocedure,
      'public.generate_cross_app_token(uuid,text,text,integer)'::regprocedure,
      'public.generate_cross_app_token(uuid,text,text,integer,jsonb)'::regprocedure,
      'public.validate_cross_app_token(text,text)'::regprocedure,
      'public.validate_cross_app_token_with_session(text,text)'::regprocedure,
      'public.revoke_all_cross_app_tokens(uuid)'::regprocedure
    )
      and pg_get_functiondef(oid) like '%public.cross_app_tokens%'
  ),
  'cross-app token helpers no longer reference the public token table'
);

select ok(
  not exists (
    select 1
    from pg_proc
    where oid in (
      'public.cleanup_expired_cross_app_tokens()'::regprocedure,
      'public.generate_cross_app_token(uuid,text,text,integer)'::regprocedure,
      'public.generate_cross_app_token(uuid,text,text,integer,jsonb)'::regprocedure,
      'public.validate_cross_app_token(text,text)'::regprocedure,
      'public.validate_cross_app_token_with_session(text,text)'::regprocedure,
      'public.revoke_all_cross_app_tokens(uuid)'::regprocedure
    )
      and pg_get_functiondef(oid) not like '%private.cross_app_tokens%'
  ),
  'cross-app token helpers reference the private token table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'trigger_cleanup_expired_cross_app_tokens'
      and tgrelid = 'private.cross_app_tokens'::regclass
      and not tgisinternal
  ),
  'cross-app token cleanup trigger is attached to the private table'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'cross_app_tokens_pkey'
      and conrelid = 'private.cross_app_tokens'::regclass
  ),
  'cross-app token primary key moved with the private table'
);

select ok(
  to_regclass('private.idx_cross_app_tokens_token') is not null,
  'cross-app token lookup index moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'internal_email_api_keys_pkey'
      and conrelid = 'private.internal_email_api_keys'::regclass
  ),
  'internal email API key primary key moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'internal_email_api_keys_user_id_key'
      and conrelid = 'private.internal_email_api_keys'::regclass
  ),
  'internal email API key uniqueness constraint moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'value_strict_length_check'
      and conrelid = 'private.internal_email_api_keys'::regclass
  ),
  'internal email API key value length constraint moved with the private table'
);

select * from finish();

rollback;
