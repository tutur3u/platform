begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

select ok(
  not has_function_privilege(
    'service_role',
    'public.generate_cross_app_token(uuid,text,text,integer,jsonb)',
    'EXECUTE'
  ),
  'service_role cannot execute the five-argument cross-app token function'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.generate_cross_app_token(uuid,text,text,integer,jsonb)',
    'EXECUTE'
  ),
  'authenticated retains execution of the five-argument cross-app token function'
);

select * from finish();
rollback;
