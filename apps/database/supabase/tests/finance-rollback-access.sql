begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
-- Run on the forward schema and again after applying the computation rollback.
select is(count(*)::integer, 4, 'all four invoice overloads remain present')
from pg_proc where pronamespace = 'public'::regnamespace
and proname in ('get_daily_invoice_totals','get_weekly_invoice_totals','get_monthly_invoice_totals');
select ok(not has_function_privilege('anon',p.oid,'EXECUTE'), p.oid::regprocedure || ' denies anon after rollback'),
       ok(not has_function_privilege('authenticated',p.oid,'EXECUTE'), p.oid::regprocedure || ' denies authenticated after rollback'),
       ok(has_function_privilege('service_role',p.oid,'EXECUTE'), p.oid::regprocedure || ' retains service access'),
       ok(not exists(select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'), p.oid::regprocedure || ' denies PUBLIC')
from pg_proc p where p.pronamespace='public'::regnamespace
and p.proname in ('get_daily_invoice_totals','get_weekly_invoice_totals','get_monthly_invoice_totals');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.get_daily_invoice_totals('71000000-0000-4000-8000-000000000010'::uuid)$$,'42501',null,'anonymous RPC denied after rollback');
reset role;
grant execute on function public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select * from public.get_monthly_invoice_totals('71000000-0000-4000-8000-000000000010'::uuid)$$,'42501',null,'internal guard survives rollback');
reset role;
select * from finish();
rollback;
