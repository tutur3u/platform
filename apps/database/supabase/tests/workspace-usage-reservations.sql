begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);
insert into public.users(id,display_name)
values ('31000000-0000-4000-8000-000000017401','Usage test owner');
insert into public.workspaces(id,name,creator_id,personal)
values ('31000000-0000-4000-8000-000000017402','Usage test','31000000-0000-4000-8000-000000017401',false);
insert into private.usage_meter_periods(ws_id,meter,starts_at,ends_at,cap,blocked)
values ('31000000-0000-4000-8000-000000017402','sandbox_seconds',now()-interval '1 hour',now()+interval '1 hour',20,false);
insert into private.usage_grants(ws_id,meter,source_key,starts_at,expires_at,units)
select '31000000-0000-4000-8000-000000017402','sandbox_seconds','fixture-' || n,now(),now()+n*interval '1 hour',10
from generate_series(1,2) n;
select throws_ok($$select public.reserve_workspace_usage('31000000-0000-4000-8000-000000017402','sandbox_seconds',
 '31000000-0000-4000-8000-000000017403',15,now()+interval '30 seconds')$$,'P0001','Commercial admission fenced','unproven controls deny admission');
insert into private.usage_admission_controls(scope_key,killed,stop_proof,security_ack,reconciled_until,net_revenue,variable_cost)
select scope,false,'test provider receipt','test review',now()+interval '1 hour',10,4
from unnest(array['global','meter/sandbox_seconds','workspace/31000000-0000-4000-8000-000000017402/sandbox_seconds']) scope
on conflict (scope_key) do update set killed = false, stop_proof = excluded.stop_proof,
 security_ack = excluded.security_ack, reconciled_until = excluded.reconciled_until,
 net_revenue = excluded.net_revenue, variable_cost = excluded.variable_cost;
create temporary table receipt as select public.reserve_workspace_usage(
 '31000000-0000-4000-8000-000000017402','sandbox_seconds','31000000-0000-4000-8000-000000017403',15,now()+interval '30 seconds') id;
select is(public.reserve_workspace_usage('31000000-0000-4000-8000-000000017402','sandbox_seconds',
 '31000000-0000-4000-8000-000000017403',15,now()+interval '30 seconds'),(select id from receipt),'reserve retry returns original hold');
select throws_ok($$select public.reserve_workspace_usage('31000000-0000-4000-8000-000000017402','sandbox_seconds',
 '31000000-0000-4000-8000-000000017404',6,now()+interval '30 seconds')$$,'P0001','Usage admission denied','cap includes pending holds');
select is(public.settle_workspace_usage('31000000-0000-4000-8000-000000017402',(select id from receipt),12),12::bigint,'settles split grants');
select is(public.settle_workspace_usage('31000000-0000-4000-8000-000000017402',(select id from receipt),12),12::bigint,'retry returns actual');
select is((select spent from private.usage_grants where source_key='fixture-2'),2::bigint,'later grant pays residual');
select is((select held from private.usage_grants where source_key='fixture-2'),0::bigint,'unused units released');
select ok(not has_function_privilege('authenticated','public.settle_workspace_usage(uuid,uuid,bigint)','execute'),'clients cannot settle');
select * from finish();
rollback;
