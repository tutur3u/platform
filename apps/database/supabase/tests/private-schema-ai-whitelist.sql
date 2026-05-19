begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(13);

select ok(
  to_regclass('public.ai_whitelisted_domains') is null,
  'ai_whitelisted_domains is no longer in the public schema'
);

select ok(
  to_regclass('private.ai_whitelisted_domains') is not null,
  'ai_whitelisted_domains exists in the private schema'
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
  not has_table_privilege('anon', 'private.ai_whitelisted_domains', 'select'),
  'anon cannot select private AI whitelisted domains'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_whitelisted_domains',
    'select'
  ),
  'authenticated cannot select private AI whitelisted domains'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_whitelisted_domains',
    'insert'
  ),
  'authenticated cannot insert private AI whitelisted domains'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_whitelisted_domains',
    'update'
  ),
  'authenticated cannot update private AI whitelisted domains'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_whitelisted_domains',
    'delete'
  ),
  'authenticated cannot delete private AI whitelisted domains'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_whitelisted_domains',
    'select'
  ),
  'service role can select private AI whitelisted domains'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_whitelisted_domains',
    'insert'
  ),
  'service role can insert private AI whitelisted domains'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_whitelisted_domains',
    'update'
  ),
  'service role can update private AI whitelisted domains'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_whitelisted_domains',
    'delete'
  ),
  'service role can delete private AI whitelisted domains'
);

select * from finish();

rollback;
