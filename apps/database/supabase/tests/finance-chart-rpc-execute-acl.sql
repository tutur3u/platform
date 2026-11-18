begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select ok(not has_function_privilege('anon', 'public.get_daily_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)', 'execute'),
  'anon cannot execute the daily finance chart RPC');
select ok(not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.get_daily_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)'::regprocedure
      and a.grantee = 0),
  'PUBLIC holds no grant on the daily finance chart RPC');
select ok(has_function_privilege('authenticated', 'public.get_daily_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)', 'execute'),
  'signed-in callers can execute the daily finance chart RPC');
select ok(has_function_privilege('service_role', 'public.get_daily_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)', 'execute'),
  'service_role can execute the daily finance chart RPC');

select ok(not has_function_privilege('anon', 'public.get_monthly_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)', 'execute'),
  'anon cannot execute the monthly finance chart RPC');
select ok(not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.get_monthly_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)'::regprocedure
      and a.grantee = 0),
  'PUBLIC holds no grant on the monthly finance chart RPC');
select ok(has_function_privilege('authenticated', 'public.get_monthly_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)', 'execute'),
  'signed-in callers can execute the monthly finance chart RPC');
select ok(has_function_privilege('service_role', 'public.get_monthly_income_expense_range(uuid,timestamp with time zone,timestamp with time zone,boolean)', 'execute'),
  'service_role can execute the monthly finance chart RPC');

select * from finish();
rollback;
