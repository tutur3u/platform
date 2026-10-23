begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(19);

select ok(
  not has_function_privilege(
    'anon',
    'public.hook_mfa_verification_attempt(jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.hook_mfa_verification_attempt(jsonb)',
    'execute'
  ),
  'API roles cannot call the MFA verification hook'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.hook_mfa_verification_attempt(jsonb)',
    'execute'
  ),
  'The service role cannot call the MFA verification hook'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.hook_mfa_verification_attempt(jsonb)',
    'execute'
  ),
  'Supabase Auth can call the MFA verification hook'
);

select ok(
  has_schema_privilege('supabase_auth_admin', 'public', 'usage')
  and not has_schema_privilege('supabase_auth_admin', 'public', 'create'),
  'Supabase Auth can resolve the hook schema without creating objects'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.mfa_verification_failures',
    'select'
  ),
  'API roles cannot read MFA failure counters'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.hook_mfa_verification_attempt(jsonb)'::regprocedure
  ),
  array['search_path=""']::text[],
  'The hook pins an empty search_path'
);

insert into auth.users (id, email, email_confirmed_at) values
  ('e3000000-0000-0000-0000-000000000001', 'mfa-hook@example.test', now());

create temporary table hook_results (n integer, result jsonb) on commit drop;

create function pg_temp.attempt(p_factor text, p_valid boolean)
returns jsonb
language sql
as $$
  select public.hook_mfa_verification_attempt(
    jsonb_build_object(
      'user_id', 'e3000000-0000-0000-0000-000000000001',
      'factor_id', p_factor,
      'factor_type', 'totp',
      'valid', p_valid
    )
  );
$$;

-- Four failures on factor 1 stay within budget.
insert into hook_results
select n, pg_temp.attempt('e3000000-0000-0000-0000-0000000000f1', false)
from generate_series(1, 4) as n;

select is(
  (select count(*)::integer from hook_results where result ->> 'decision' = 'continue'),
  4,
  'Failures within the factor budget continue'
);

select is(
  pg_temp.attempt('e3000000-0000-0000-0000-0000000000f1', true) ->> 'decision',
  'continue',
  'A valid code within budget continues'
);

select is(
  (
    select count(*)::integer
    from private.mfa_verification_failures
    where user_id = 'e3000000-0000-0000-0000-000000000001'
  ),
  0,
  'A valid code clears the counters'
);

-- Five failures exhaust the factor budget.
select pg_temp.attempt('e3000000-0000-0000-0000-0000000000f1', false)
from generate_series(1, 5);

select is(
  (pg_temp.attempt('e3000000-0000-0000-0000-0000000000f1', true) -> 'error' ->> 'http_code')::integer,
  429,
  'A correct code is refused while the factor budget is spent'
);

select is(
  pg_temp.attempt('e3000000-0000-0000-0000-0000000000f2', false) ->> 'decision',
  'continue',
  'Another factor keeps its own budget'
);

-- Exhaust the account budget across factors (5 + 1 so far, 4 more).
select pg_temp.attempt('e3000000-0000-0000-0000-0000000000f2', false)
from generate_series(1, 2);
select pg_temp.attempt('e3000000-0000-0000-0000-0000000000f3', false)
from generate_series(1, 2);

select is(
  (pg_temp.attempt('e3000000-0000-0000-0000-0000000000f4', true) -> 'error' ->> 'http_code')::integer,
  429,
  'A spent account budget refuses every factor'
);

-- Expired windows reset the budget.
update private.mfa_verification_failures
set window_started_at = now() - interval '2 hours'
where user_id = 'e3000000-0000-0000-0000-000000000001';

select is(
  pg_temp.attempt('e3000000-0000-0000-0000-0000000000f1', false) ->> 'decision',
  'continue',
  'Attempts continue once the window has passed'
);

select is(
  (
    select failed_count
    from private.mfa_verification_failures
    where user_id = 'e3000000-0000-0000-0000-000000000001'
      and scope_key = 'factor:e3000000-0000-0000-0000-0000000000f1'
  ),
  1,
  'An expired window restarts the factor count'
);

select is(
  public.hook_mfa_verification_attempt('{"user_id":"not-a-uuid","valid":false}'::jsonb) ->> 'decision',
  'continue',
  'Malformed events fall through to Auth''s default handling'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$select public.hook_mfa_verification_attempt('{}'::jsonb)$$,
  '42501',
  null,
  'authenticated is denied the hook over RPC'
);

reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  $$select public.hook_mfa_verification_attempt('{}'::jsonb)$$,
  '42501',
  null,
  'anon is denied the hook over RPC'
);

reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $$select public.hook_mfa_verification_attempt('{}'::jsonb)$$,
  '42501',
  null,
  'service_role is denied the hook over RPC'
);

reset role;

set local role supabase_auth_admin;

select is(
  public.hook_mfa_verification_attempt(
    jsonb_build_object(
      'user_id', 'e3000000-0000-0000-0000-000000000001',
      'factor_id', 'e3000000-0000-0000-0000-0000000000f9',
      'factor_type', 'totp',
      'valid', true
    )
  ) ->> 'decision',
  'continue',
  'Supabase Auth runs the hook under its own role'
);

reset role;

select * from finish();

rollback;
