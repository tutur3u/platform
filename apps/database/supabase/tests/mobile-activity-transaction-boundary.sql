begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select ok(to_regprocedure('public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,text,text,integer,integer,timestamp with time zone,timestamp with time zone,boolean)') is null,
  'old default overload removed');
select ok(to_regprocedure('public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,text,text,integer,integer,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)') is not null,
  'boundary-capable signature exists');

insert into public.users(id) values
 ('40000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002'),
 ('40000000-0000-0000-0000-000000000003');
insert into public.workspaces(id,name,personal,creator_id) values
 ('40000000-0000-0000-0000-000000000010','Synthetic activity boundary',false,'40000000-0000-0000-0000-000000000003');
insert into public.workspace_members(ws_id,user_id,type) values
 ('40000000-0000-0000-0000-000000000010','40000000-0000-0000-0000-000000000001','MEMBER')
 on conflict(ws_id,user_id) do nothing;
insert into public.workspace_roles(id,ws_id,name) values
 ('40000000-0000-0000-0000-000000000011','40000000-0000-0000-0000-000000000010','Synthetic finance reader');
insert into public.workspace_role_members(role_id,user_id) values
 ('40000000-0000-0000-0000-000000000011','40000000-0000-0000-0000-000000000001');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values
 ('40000000-0000-0000-0000-000000000010','40000000-0000-0000-0000-000000000011','manage_finance',true),
 ('40000000-0000-0000-0000-000000000010','40000000-0000-0000-0000-000000000011','view_transactions',true);
set local role service_role;
insert into private.workspace_wallets(id,ws_id,name,type,currency) values
 ('40000000-0000-0000-0000-000000000012','40000000-0000-0000-0000-000000000010','Synthetic boundary wallet','STANDARD','USD');
insert into public.wallet_transactions(id,wallet_id,amount,created_at,taken_at,platform_creator_id) values
 ('40000000-0000-0000-0000-000000000101','40000000-0000-0000-0000-000000000012',1,'2026-09-01','2026-08-01','40000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000102','40000000-0000-0000-0000-000000000012',2,'2026-09-01','2026-08-01','40000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000103','40000000-0000-0000-0000-000000000012',3,'2026-09-01','2026-08-01','40000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
create temporary table first_page as select * from get_wallet_transactions_with_permissions(
 p_ws_id=>'40000000-0000-0000-0000-000000000010',p_creator_ids=>array['40000000-0000-0000-0000-000000000001'::uuid],
 p_order_by=>'created_at',p_limit=>1,p_created_at_until=>'2026-09-02');
select is((select id::text from first_page),'40000000-0000-0000-0000-000000000103','tied creation timestamps order by unique ID');
insert into public.wallet_transactions(id,wallet_id,amount,created_at,taken_at,platform_creator_id) values
 ('40000000-0000-0000-0000-000000000104','40000000-0000-0000-0000-000000000012',4,'2026-09-03','2026-08-01','40000000-0000-0000-0000-000000000001');
create temporary table second_page as select * from get_wallet_transactions_with_permissions(
 p_ws_id=>'40000000-0000-0000-0000-000000000010',p_order_by=>'created_at',p_limit=>1,p_offset=>1,p_created_at_until=>'2026-09-02');
select is((select id::text from second_page),'40000000-0000-0000-0000-000000000102','post-boundary insertion cannot shift next offset page');
select is((select count(*) from get_wallet_transactions_with_permissions(
 p_ws_id=>'40000000-0000-0000-0000-000000000010',p_order_by=>'created_at',p_created_at_until=>'2026-09-02')),3::bigint,'creation bound applies independently of taken date');
select is((select count(*) from get_wallet_transactions_with_permissions(
 p_ws_id=>'40000000-0000-0000-0000-000000000010',p_order_by=>'created_at')),4::bigint,'old named calls retain unbounded default');
insert into public.wallet_transactions(id,wallet_id,amount,created_at,taken_at,platform_creator_id,is_amount_confidential) values
 ('40000000-0000-0000-0000-000000000105','40000000-0000-0000-0000-000000000012',5,'2026-09-01','2026-08-01','40000000-0000-0000-0000-000000000001',true);
select ok((select amount is null from get_wallet_transactions_with_permissions(
 p_ws_id=>'40000000-0000-0000-0000-000000000010',p_transaction_ids=>array['40000000-0000-0000-0000-000000000105'::uuid],
 p_created_at_until=>'2026-09-02')), 'boundary retains confidential amount redaction');
select is((select count(*) from get_wallet_transactions_with_permissions(
 p_ws_id=>'40000000-0000-0000-0000-000000000010',p_transaction_type=>'income',p_created_at_until=>'2026-09-02')),3::bigint,
 'income filter never exposes a confidential amount sign');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
select is((select count(*) from get_wallet_transactions_with_permissions(
 p_ws_id=>'40000000-0000-0000-0000-000000000010',p_order_by=>'created_at',p_created_at_until=>'2026-09-02')),0::bigint,'boundary never grants unrelated actor wallet visibility');
select throws_ok($$select * from get_wallet_transactions_with_permissions(
 p_ws_id=>'40000000-0000-0000-0000-000000000010',p_user_id=>'40000000-0000-0000-0000-000000000001',p_created_at_until=>'2026-09-02')$$,
 'P0001','Permission denied','actor impersonation remains denied');
select * from finish();
rollback;
