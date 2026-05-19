begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(13);

select ok(
  to_regclass('public.ai_whitelisted_emails') is null,
  'ai_whitelisted_emails is no longer in the public schema'
);

select ok(
  to_regclass('private.ai_whitelisted_emails') is not null,
  'ai_whitelisted_emails exists in the private schema'
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
  not has_table_privilege('anon', 'private.ai_whitelisted_emails', 'select'),
  'anon cannot select private AI whitelisted emails'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_whitelisted_emails',
    'select'
  ),
  'authenticated cannot select private AI whitelisted emails'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_whitelisted_emails',
    'insert'
  ),
  'authenticated cannot insert private AI whitelisted emails'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_whitelisted_emails',
    'update'
  ),
  'authenticated cannot update private AI whitelisted emails'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.ai_whitelisted_emails',
    'delete'
  ),
  'authenticated cannot delete private AI whitelisted emails'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_whitelisted_emails',
    'select'
  ),
  'service role can select private AI whitelisted emails'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_whitelisted_emails',
    'insert'
  ),
  'service role can insert private AI whitelisted emails'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_whitelisted_emails',
    'update'
  ),
  'service role can update private AI whitelisted emails'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.ai_whitelisted_emails',
    'delete'
  ),
  'service role can delete private AI whitelisted emails'
);

select * from finish();

rollback;
