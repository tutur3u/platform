begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select plan(12);
insert into public.users(id,display_name)
values ('31000000-0000-4000-8000-000000017401','Pack fixture owner');
insert into public.workspaces(id,name,creator_id,personal)
values ('31000000-0000-4000-8000-000000017402','Pack fixture','31000000-0000-4000-8000-000000017401',false);
insert into private.usage_pack_products values
 ('31000000-0000-4000-8000-000000017408','sandbox_seconds',500,60000);
create function pg_temp.apply_pack(status text, net integer, observed interval default interval '0',
  order_id uuid default '31000000-0000-4000-8000-000000017403',
  customer text default 'workspace_31000000-0000-4000-8000-000000017402',meter text default 'sandbox_seconds')
returns void language sql as $$
 select public.apply_usage_pack_order('31000000-0000-4000-8000-000000017402',order_id,
 '31000000-0000-4000-8000-000000017408',customer,meter,status,net,now()-interval '1 day',now()+observed,null)
$$;
select ok(not has_function_privilege('authenticated','public.apply_usage_pack_order(uuid,uuid,uuid,text,text,text,integer,timestamptz,timestamptz,timestamptz)','execute'),'user denied');
select ok(not has_function_privilege('anon','public.apply_usage_pack_order(uuid,uuid,uuid,text,text,text,integer,timestamptz,timestamptz,timestamptz)','execute'),'anon denied');
select throws_ok($$select pg_temp.apply_pack('paid',500,customer=>'other')$$,'P0001','Order customer mismatch','customer rejected');
select throws_ok($$select pg_temp.apply_pack('paid',500,meter=>'participant_seconds')$$,'P0001','Unbound usage product or amount','SKU meter mismatch');
select throws_ok($$select pg_temp.apply_pack('paid',1)$$,'P0001','Unbound usage product or amount','underpriced pack rejected');
select pg_temp.apply_pack('paid',500);
select pg_temp.apply_pack('paid',500);
select is((select count(*) from private.usage_grants where source_key='polar-order/31000000-0000-4000-8000-000000017403'),1::bigint,'one grant on retry');
select pg_temp.apply_pack('refunded',0,interval '-1 hour');
select is((select refunded from private.usage_pack_orders where id='31000000-0000-4000-8000-000000017403'),false,'older observation ignored');
insert into private.usage_meter_periods(ws_id,meter,starts_at,ends_at,cap,blocked)
values('31000000-0000-4000-8000-000000017402','sandbox_seconds',now()-interval '1 hour',now()+interval '1 hour',100,false);
insert into private.usage_admission_controls(scope_key,killed) values('workspace/31000000-0000-4000-8000-000000017402/sandbox_seconds',false);
select pg_temp.apply_pack('refunded',0);
select pg_temp.apply_pack('paid',500,interval '1 hour');
select is((select refunded from private.usage_pack_orders where id='31000000-0000-4000-8000-000000017403'),true,'refund cannot reopen');
select ok((select blocked from private.usage_meter_periods where ws_id='31000000-0000-4000-8000-000000017402'),'refund blocks period');
select ok((select killed from private.usage_admission_controls where scope_key='workspace/31000000-0000-4000-8000-000000017402/sandbox_seconds'),'refund fences meter');
select ok((select expires_at<=clock_timestamp() from private.usage_grants where source_key='polar-order/31000000-0000-4000-8000-000000017403'),'refund expires grant');
select pg_temp.apply_pack('refunded',0,order_id=>'31000000-0000-4000-8000-000000017404');
select is((select grant_id from private.usage_pack_orders where id='31000000-0000-4000-8000-000000017404'),null::uuid,'first-seen refund grants nothing');
select * from finish();
rollback;
