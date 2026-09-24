begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select lives_ok(
  $$select public.check_account_request()$$,
  'Anonymous handoffs pass the request hook without invoking the account MFA probe'
);
select throws_ok(
  $$select public.account_required_mfa_satisfied()$$,
  '42501', 'permission denied for function account_required_mfa_satisfied',
  'The account MFA probe remains unavailable to anonymous callers'
);
select is(
  (select user_id from public.validate_cross_app_token_with_session('invalid-test-token', 'parley')),
  null::uuid,
  'Passing the request hook does not admit an invalid handoff token'
);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok($$select public.check_account_request()$$, 'Service requests preserve the existing request hook');
reset role;
select * from finish();
rollback;
