begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

select ok(
  not has_function_privilege('anon', 'public.get_user_workspace_subscription_info(uuid)', 'execute'),
  'anon lacks EXECUTE on workspace subscription info'
);
select ok(
  not has_function_privilege('authenticated', 'public.get_user_workspace_subscription_info(uuid)', 'execute'),
  'authenticated lacks EXECUTE on workspace subscription info'
);
select ok(
  has_function_privilege('service_role', 'public.get_user_workspace_subscription_info(uuid)', 'execute'),
  'service_role retains EXECUTE on workspace subscription info'
);

set local role anon;
select throws_ok(
  $$select * from public.get_user_workspace_subscription_info('00009209-0000-4000-8000-000000000001'::uuid)$$,
  '42501', null, 'anon cannot call workspace subscription info'
);
reset role;

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select lives_ok(
  $$select * from public.get_user_workspace_subscription_info('00009209-0000-4000-8000-000000000001'::uuid)$$,
  'service_role can call workspace subscription info'
);
reset role;

select * from finish();
rollback;
