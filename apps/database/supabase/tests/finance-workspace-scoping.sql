begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

insert into public.users(id) values
 ('36400000-0000-4000-8000-000000000001'),
 ('36400000-0000-4000-8000-000000000002'),
 ('36400000-0000-4000-8000-000000000003'),
 ('36400000-0000-4000-8000-000000000004');
insert into public.workspaces(id,name,personal,creator_id) values
 ('36400000-0000-4000-8000-000000000010','Finance scope A',false,'36400000-0000-4000-8000-000000000004'),
 ('36400000-0000-4000-8000-000000000020','Finance scope B',false,'36400000-0000-4000-8000-000000000004');
insert into public.workspace_members(ws_id,user_id,type) values
 ('36400000-0000-4000-8000-000000000010','36400000-0000-4000-8000-000000000001','GUEST'),
 ('36400000-0000-4000-8000-000000000010','36400000-0000-4000-8000-000000000002','MEMBER'),
 ('36400000-0000-4000-8000-000000000010','36400000-0000-4000-8000-000000000003','MEMBER')
 on conflict(ws_id,user_id) do nothing;
delete from public.workspace_default_permissions
 where ws_id in ('36400000-0000-4000-8000-000000000010','36400000-0000-4000-8000-000000000020');
insert into public.workspace_roles(id,ws_id,name) values
 ('36400000-0000-4000-8000-000000000030','36400000-0000-4000-8000-000000000010','Finance manager');
insert into public.workspace_role_members(role_id,user_id) values
 ('36400000-0000-4000-8000-000000000030','36400000-0000-4000-8000-000000000003');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values
 ('36400000-0000-4000-8000-000000000010','36400000-0000-4000-8000-000000000030','manage_finance',true),
 ('36400000-0000-4000-8000-000000000010','36400000-0000-4000-8000-000000000030','view_transactions',true);
set local role service_role;
insert into private.workspace_wallets(id,ws_id,name,type,currency) values
 ('36400000-0000-4000-8000-000000000011','36400000-0000-4000-8000-000000000010','A','STANDARD','USD'),
 ('36400000-0000-4000-8000-000000000021','36400000-0000-4000-8000-000000000020','B','STANDARD','USD');
insert into public.transaction_categories(id,ws_id,name,is_expense) values
 ('36400000-0000-4000-8000-000000000012','36400000-0000-4000-8000-000000000010','A category',true),
 ('36400000-0000-4000-8000-000000000022','36400000-0000-4000-8000-000000000020','B private category',true),
 ('36400000-0000-4000-8000-000000000013','36400000-0000-4000-8000-000000000010','Empty category',true);
insert into public.wallet_transactions(id,wallet_id,category_id,amount,taken_at) values
 ('36400000-0000-4000-8000-000000000101','36400000-0000-4000-8000-000000000011','36400000-0000-4000-8000-000000000012',-7,now()),
 ('36400000-0000-4000-8000-000000000102','36400000-0000-4000-8000-000000000011','36400000-0000-4000-8000-000000000022',-50,now()),
 ('36400000-0000-4000-8000-000000000103','36400000-0000-4000-8000-000000000021','36400000-0000-4000-8000-000000000012',-99,now());
reset role;

select is((select count(*) from pg_policies where schemaname='public' and tablename='wallet_transactions'
 and permissive='PERMISSIVE' and roles && array['authenticated','anon','public']::name[]),0::bigint,
 'the final schema retains no permissive client transaction policies');
select ok(not has_table_privilege('authenticated','public.wallet_transactions','INSERT,UPDATE,DELETE'),
 'authenticated transaction writes remain revoked');
select is((select count(*) from pg_policies where schemaname='public' and tablename='wallet_transactions'
 and policyname='account_required_mfa' and permissive='RESTRICTIVE'),1::bigint,
 'the restrictive MFA policy remains intact');
select ok(not has_table_privilege('anon','public.wallet_transactions','SELECT,INSERT,UPDATE,DELETE'),
 'anonymous transaction access remains revoked');

set local role authenticated;
select set_config('request.jwt.claim.sub','36400000-0000-4000-8000-000000000001',true);
select throws_ok($$select * from public.wallet_transactions$$,'42501',null,'guest cannot read');
select throws_ok($$insert into public.wallet_transactions(wallet_id,amount) values ('36400000-0000-4000-8000-000000000011',1)$$,
 '42501',null,'guest cannot insert');
select throws_ok($$update public.wallet_transactions set amount=2 where id='36400000-0000-4000-8000-000000000101'$$,
 '42501',null,'guest cannot update');
select throws_ok($$delete from public.wallet_transactions where id='36400000-0000-4000-8000-000000000101'$$,
 '42501',null,'guest cannot delete');

select set_config('request.jwt.claim.sub','36400000-0000-4000-8000-000000000002',true);
select ok(not public.has_workspace_permission('36400000-0000-4000-8000-000000000010',auth.uid(),'manage_finance'),
 'ordinary member lacks finance permission');
select throws_ok($$insert into public.wallet_transactions(wallet_id,amount) values ('36400000-0000-4000-8000-000000000011',1)$$,
 '42501',null,'ordinary member cannot insert');
select throws_ok($$update public.wallet_transactions set amount=2 where id='36400000-0000-4000-8000-000000000101'$$,
 '42501',null,'ordinary member cannot update');
select throws_ok($$delete from public.wallet_transactions where id='36400000-0000-4000-8000-000000000101'$$,
 '42501',null,'ordinary member cannot delete');

select set_config('request.jwt.claim.sub','36400000-0000-4000-8000-000000000003',true);
select ok(public.has_workspace_permission('36400000-0000-4000-8000-000000000010',auth.uid(),'manage_finance'),
 'finance member has the API permission');
select throws_ok($$insert into public.wallet_transactions(wallet_id,amount) values ('36400000-0000-4000-8000-000000000011',1)$$,
 '42501',null,'finance member also writes through the admin-backed API');
reset role;
set local role service_role;
-- API unit tests cover the permission check before these admin operations.
select lives_ok($$insert into public.wallet_transactions(id,wallet_id,amount) values ('36400000-0000-4000-8000-000000000104','36400000-0000-4000-8000-000000000011',1)$$,
 'permitted API admin client can insert');
select lives_ok($$update public.wallet_transactions set description='updated' where id='36400000-0000-4000-8000-000000000104'$$,
 'permitted API admin client can update');
select lives_ok($$delete from public.wallet_transactions where id='36400000-0000-4000-8000-000000000104'$$,
 'permitted API admin client can delete');
select is((select count(*) from public.wallet_transactions where id='36400000-0000-4000-8000-000000000104'),0::bigint,
 'admin deletion removes the inserted row');

select is((select amount from public.get_transaction_categories_with_amount_by_workspace('36400000-0000-4000-8000-000000000010')
 where id='36400000-0000-4000-8000-000000000012'),7::numeric,'category rollup excludes foreign wallet amounts');
select is((select transaction_count from public.get_transaction_categories_with_amount_by_workspace('36400000-0000-4000-8000-000000000010')
 where id='36400000-0000-4000-8000-000000000012'),1::bigint,'category count excludes foreign wallets');
select is((select amount from public.get_transaction_categories_with_amount_by_workspace('36400000-0000-4000-8000-000000000010')
 where id='36400000-0000-4000-8000-000000000022'),null::numeric,'category RPC excludes foreign categories');
select is((select amount from public.get_transaction_categories_with_amount_by_workspace('36400000-0000-4000-8000-000000000010')
 where id='36400000-0000-4000-8000-000000000013'),0::numeric,'empty category remains visible with zero amount');
select is((select transaction_count from public.get_transaction_categories_with_amount_by_workspace('36400000-0000-4000-8000-000000000010')
 where id='36400000-0000-4000-8000-000000000013'),0::bigint,'empty category has zero transactions');
select set_config('request.jwt.claim.sub','36400000-0000-4000-8000-000000000003',true);
select is((select category_name from public.get_wallet_transactions_with_permissions(
 p_ws_id=>'36400000-0000-4000-8000-000000000010',p_transaction_ids=>array['36400000-0000-4000-8000-000000000102'::uuid])),
 null::text,'transaction list hides foreign category metadata');
select is((select category_name from public.get_wallet_transactions_with_permissions(
 p_ws_id=>'36400000-0000-4000-8000-000000000010',p_transaction_ids=>array['36400000-0000-4000-8000-000000000101'::uuid])),
 'A category','transaction list retains workspace category');
select is((select count(*) from public.get_wallet_transactions_with_permissions(
 p_ws_id=>'36400000-0000-4000-8000-000000000010',p_transaction_ids=>array['36400000-0000-4000-8000-000000000103'::uuid])),
 0::bigint,'transaction list excludes a foreign wallet');
select is((select total_count from public.get_wallet_transactions_with_permissions(
 p_ws_id=>'36400000-0000-4000-8000-000000000010',p_include_count=>true) limit 1),
 2::bigint,'transaction count remains scoped to the wallet workspace');
select ok(not has_table_privilege('authenticated','private.workspace_wallets','SELECT'),
 'private wallet access remains closed');
select * from finish();
rollback;
