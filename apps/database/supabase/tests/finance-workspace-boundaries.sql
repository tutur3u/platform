begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.users(id) values
 ('71000000-0000-4000-8000-000000000001'),
 ('71000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name,creator_id) values
 ('71000000-0000-4000-8000-000000000010','Finance boundary A','71000000-0000-4000-8000-000000000001'),
 ('71000000-0000-4000-8000-000000000020','Finance boundary B','71000000-0000-4000-8000-000000000002');
delete from public.workspace_default_permissions where ws_id in ('71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000020');
insert into public.workspace_members(ws_id,user_id,type) values
 ('71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000002','MEMBER');
insert into private.workspace_wallets(id,ws_id,name,currency) values
 ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000010','Local wallet','USD'),
 ('71000000-0000-4000-8000-000000000021','71000000-0000-4000-8000-000000000020','Other wallet','USD');
insert into public.finance_budgets(id,ws_id,name,amount,start_date,end_date) values
 ('71000000-0000-4000-8000-000000000012','71000000-0000-4000-8000-000000000010','A budget',1000,'2026-01-01','2026-12-31'),
 ('71000000-0000-4000-8000-000000000022','71000000-0000-4000-8000-000000000020','B budget',1000,'2026-01-01','2026-12-31');
insert into public.wallet_transactions(id,wallet_id,amount,taken_at) values
 ('71000000-0000-4000-8000-000000000013','71000000-0000-4000-8000-000000000011',-30,'2026-02-01');
select is((select spent from public.finance_budgets where id='71000000-0000-4000-8000-000000000012'),30::numeric,'local expense updates local budget');
select is((select spent from public.finance_budgets where id='71000000-0000-4000-8000-000000000022'),0::numeric,'local expense never updates another tenant budget');
insert into public.wallet_transactions(id,wallet_id,amount,taken_at) values
 ('71000000-0000-4000-8000-000000000023','71000000-0000-4000-8000-000000000021',-70,'2026-02-01');
select is((select spent from public.finance_budgets where id='71000000-0000-4000-8000-000000000012'),30::numeric,'walletless budget excludes other tenant expenses');
select is((select spent from public.finance_budgets where id='71000000-0000-4000-8000-000000000022'),70::numeric,'other tenant budget includes only its own expenses');
update public.wallet_transactions set wallet_id='71000000-0000-4000-8000-000000000021' where id='71000000-0000-4000-8000-000000000013';
select is((select spent from public.finance_budgets where id='71000000-0000-4000-8000-000000000012'),0::numeric,'moving a transaction refreshes the old workspace');
select is((select spent from public.finance_budgets where id='71000000-0000-4000-8000-000000000022'),100::numeric,'moving a transaction refreshes the new workspace');
delete from public.wallet_transactions where id='71000000-0000-4000-8000-000000000013';
select is((select spent from public.finance_budgets where id='71000000-0000-4000-8000-000000000022'),70::numeric,'deletion recomputes local spending');
select throws_ok($$insert into public.finance_budgets(ws_id,name,amount,start_date,wallet_id) values ('71000000-0000-4000-8000-000000000010','Invalid',10,'2026-01-01','71000000-0000-4000-8000-000000000021')$$,'23514',null,'database rejects foreign budget wallet');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(not has_table_privilege('authenticated', 'public.finance_budgets', 'SELECT'), 'budget table remains behind authorized service routes');
select throws_ok($$insert into public.finance_budgets(ws_id,name,amount,start_date) values ('71000000-0000-4000-8000-000000000010','Denied',10,'2026-01-01')$$,'42501',null,'membership alone cannot create finance budgets');
select throws_ok($$select * from public.get_transaction_stats(p_ws_id=>'71000000-0000-4000-8000-000000000010',p_user_id=>'71000000-0000-4000-8000-000000000001')$$,'42501',null,'stats rejects another actor identity');
select throws_ok($$select * from public.get_transaction_stats(p_ws_id=>'71000000-0000-4000-8000-000000000010')$$,'42501',null,'stats rejects an actor without finance permission');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select * from public.get_transaction_stats(p_ws_id=>'71000000-0000-4000-8000-000000000010')$$,'stats retains permitted self calls');
reset role;
select ok(not has_function_privilege('anon','public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz)','EXECUTE'),'anon cannot execute transaction stats');
select ok(has_function_privilege('authenticated','public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz)','EXECUTE'),'authenticated retains transaction stats');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_daily_invoice_totals','get_weekly_invoice_totals','get_monthly_invoice_totals') and has_function_privilege('anon',p.oid,'EXECUTE')),'anon cannot execute invoice analytics siblings');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_daily_invoice_totals','get_weekly_invoice_totals','get_monthly_invoice_totals') and has_function_privilege('authenticated',p.oid,'EXECUTE')),'authenticated uses authorized invoice analytics routes');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_daily_invoice_totals','get_weekly_invoice_totals','get_monthly_invoice_totals') and not has_function_privilege('service_role',p.oid,'EXECUTE')),'service role retains every invoice analytics sibling');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.get_transaction_stats(p_ws_id=>'71000000-0000-4000-8000-000000000010',p_user_id=>'71000000-0000-4000-8000-000000000001')$$,'42501',null,'anon stats call denied');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select * from public.get_transaction_stats(p_ws_id=>'71000000-0000-4000-8000-000000000010',p_user_id=>'71000000-0000-4000-8000-000000000001')$$,'service stats caller supplies the permitted actor');
select lives_ok($$select * from public.get_daily_invoice_totals('71000000-0000-4000-8000-000000000010'::uuid,1,null::uuid[],null::uuid[],'2026-01-01'::date,'2026-01-02'::date)$$,'service role can execute get_daily_invoice_totals');
select throws_ok($$select * from public.get_weekly_invoice_totals('71000000-0000-4000-8000-000000000010'::uuid,1,null::uuid[],null::uuid[],'2026-01-01'::date,'2026-01-02'::date)$$,'42725',null,'pre-existing six-argument overload ambiguity remains: service role can execute get_weekly_invoice_totals');
select lives_ok($$select * from public.get_weekly_invoice_totals('71000000-0000-4000-8000-000000000010'::uuid,1,null::uuid[],null::uuid[],'2026-01-01'::date,'2026-01-02'::date,1)$$,'service role can execute get_weekly_invoice_totals,1');
select lives_ok($$select * from public.get_monthly_invoice_totals('71000000-0000-4000-8000-000000000010'::uuid,1,null::uuid[],null::uuid[],'2026-01-01'::date,'2026-01-02'::date)$$,'service role can execute get_monthly_invoice_totals');
reset role;
select * from finish();
rollback;
