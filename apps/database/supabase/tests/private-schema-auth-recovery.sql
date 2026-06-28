begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select ok(
  to_regclass('private.auth_recovery_overrides') is not null,
  'auth recovery overrides exist in the private schema'
);

select ok(
  to_regclass('private.auth_recovery_tokens') is not null,
  'auth recovery tokens exist in the private schema'
);

select ok(
  to_regclass('private.auth_recovery_events') is not null,
  'auth recovery events exist in the private schema'
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
  (
    select bool_and(
      has_table_privilege('service_role', format('private.%I', table_name), 'select')
      and has_table_privilege('service_role', format('private.%I', table_name), 'insert')
      and has_table_privilege('service_role', format('private.%I', table_name), 'update')
      and has_table_privilege('service_role', format('private.%I', table_name), 'delete')
    )
    from (
      values
        ('auth_recovery_overrides'),
        ('auth_recovery_tokens'),
        ('auth_recovery_events')
    ) as tables(table_name)
  ),
  'service role can select and mutate private auth recovery tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('auth_recovery_overrides'),
        ('auth_recovery_tokens'),
        ('auth_recovery_events')
    ) as tables(table_name)
    where has_table_privilege('anon', format('private.%I', table_name), 'select')
      or has_table_privilege('anon', format('private.%I', table_name), 'insert')
      or has_table_privilege('anon', format('private.%I', table_name), 'update')
      or has_table_privilege('anon', format('private.%I', table_name), 'delete')
  ),
  'anon cannot select or mutate private auth recovery tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('auth_recovery_overrides'),
        ('auth_recovery_tokens'),
        ('auth_recovery_events')
    ) as tables(table_name)
    where has_table_privilege('authenticated', format('private.%I', table_name), 'select')
      or has_table_privilege('authenticated', format('private.%I', table_name), 'insert')
      or has_table_privilege('authenticated', format('private.%I', table_name), 'update')
      or has_table_privilege('authenticated', format('private.%I', table_name), 'delete')
  ),
  'authenticated cannot select or mutate private auth recovery tables'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.auth_recovery_overrides'::regclass
  ),
  'auth recovery overrides have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.auth_recovery_tokens'::regclass
  ),
  'auth recovery tokens have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.auth_recovery_events'::regclass
  ),
  'auth recovery events have RLS enabled'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_active_auth_recovery_override(text)',
    'execute'
  ),
  'service role can execute active auth recovery override lookup'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.get_active_auth_recovery_override(text)',
    'execute'
  ),
  'anon cannot execute active auth recovery override lookup'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.consume_auth_recovery_credential(text,text,text,text,text)',
    'execute'
  ),
  'service role can execute auth recovery credential consume'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.consume_auth_recovery_credential(text,text,text,text,text)',
    'execute'
  ),
  'anon cannot execute auth recovery credential consume'
);

create temporary table auth_recovery_test_ids (
  key text primary key,
  id uuid not null
);

with inserted as (
  insert into private.auth_recovery_overrides (
    email,
    reason,
    expires_at
  )
  values
    ('active@example.com', 'active test override', now() + interval '1 day'),
    ('expired@example.com', 'expired test override', now() + interval '1 day'),
    ('revoked@example.com', 'revoked test override', now() + interval '1 day')
  returning id, email
)
insert into auth_recovery_test_ids (key, id)
select
  case inserted.email
    when 'active@example.com' then 'active'
    when 'expired@example.com' then 'expired'
    else 'revoked'
  end,
  inserted.id
from inserted;

update private.auth_recovery_overrides
set
  created_at = now() - interval '1 day',
  expires_at = now() - interval '1 minute'
where email = 'expired@example.com';

update private.auth_recovery_overrides
set revoked_at = now(), revoke_reason = 'test revoke'
where email = 'revoked@example.com';

select results_eq(
  $$ select email from private.get_active_auth_recovery_override(' Active@Example.com ') $$,
  $$ values ('active@example.com'::text) $$,
  'active override lookup normalizes email'
);

select is_empty(
  $$ select * from private.get_active_auth_recovery_override('expired@example.com') $$,
  'expired override does not resolve as active'
);

select is_empty(
  $$ select * from private.get_active_auth_recovery_override('revoked@example.com') $$,
  'revoked override does not resolve as active'
);

insert into private.auth_recovery_tokens (
  override_id,
  email,
  token_hash,
  code_hash,
  expires_at
)
select id, 'active@example.com', repeat('a', 64), repeat('b', 64), now() + interval '15 minutes'
from auth_recovery_test_ids
where key = 'active';

select results_eq(
  $$
    select consumed_by, email
    from private.consume_auth_recovery_credential(
      p_token_hash => repeat('a', 64)
    )
  $$,
  $$ values ('token'::text, 'active@example.com'::text) $$,
  'token credential consumes successfully'
);

select is_empty(
  $$
    select *
    from private.consume_auth_recovery_credential(
      p_token_hash => repeat('a', 64)
    )
  $$,
  'token credential is single-use'
);

insert into private.auth_recovery_tokens (
  override_id,
  email,
  token_hash,
  code_hash,
  expires_at
)
select id, 'active@example.com', repeat('c', 64), repeat('d', 64), now() + interval '15 minutes'
from auth_recovery_test_ids
where key = 'active';

select results_eq(
  $$
    select consumed_by, email
    from private.consume_auth_recovery_credential(
      p_email => ' ACTIVE@Example.com ',
      p_code_hash => repeat('d', 64)
    )
  $$,
  $$ values ('code'::text, 'active@example.com'::text) $$,
  'code credential consumes successfully'
);

select is_empty(
  $$
    select *
    from private.consume_auth_recovery_credential(
      p_email => 'active@example.com',
      p_code_hash => repeat('d', 64)
    )
  $$,
  'code credential is single-use'
);

insert into private.auth_recovery_events (
  override_id,
  email,
  event_type,
  metadata
)
select id, 'active@example.com', 'override_created', '{"source":"pgtap"}'::jsonb
from auth_recovery_test_ids
where key = 'active';

select ok(
  exists (
    select 1
    from private.auth_recovery_events
    where email = 'active@example.com'
      and event_type = 'override_created'
      and metadata ->> 'source' = 'pgtap'
  ),
  'auth recovery audit events can be written'
);

select * from finish();

rollback;
