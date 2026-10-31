begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();

create function pg_temp.adc_id(n integer) returns uuid language sql as $$
  select ('c1900000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

-- Check every overload, including any future overload of the maintenance RPCs.
select ok(not has_function_privilege('anon', p.oid, 'execute'),
  p.oid::regprocedure || ': anon denied')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('get_bounce_complaint_stats', 'get_workspace_overview_summary',
   'create_missing_personal_workspaces', 'get_group_report_status_summary',
   'get_user_report_status_summary');
select ok(not has_function_privilege('authenticated', p.oid, 'execute'),
  p.oid::regprocedure || ': authenticated denied (admin-only callers)')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('get_bounce_complaint_stats', 'get_workspace_overview_summary',
   'create_missing_personal_workspaces', 'get_group_report_status_summary',
   'get_user_report_status_summary');
select ok(has_function_privilege('service_role', p.oid, 'execute'),
  p.oid::regprocedure || ': service role admitted')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('get_bounce_complaint_stats', 'get_workspace_overview_summary',
   'create_missing_personal_workspaces', 'get_group_report_status_summary',
   'get_user_report_status_summary');
select ok(not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE'),
  p.oid::regprocedure || ': no PUBLIC execute')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('get_bounce_complaint_stats', 'get_workspace_overview_summary',
   'create_missing_personal_workspaces', 'get_group_report_status_summary',
   'get_user_report_status_summary');

insert into auth.users(id) select pg_temp.adc_id(n) from generate_series(1,3) n;
insert into public.users(id) select pg_temp.adc_id(n) from generate_series(1,3) n on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id)
values(pg_temp.adc_id(10),'Synthetic report summary',false,pg_temp.adc_id(1));
insert into public.workspace_members(ws_id,user_id,type)
values(pg_temp.adc_id(10),pg_temp.adc_id(2),'MEMBER');
update public.workspace_default_permissions set enabled=false where ws_id=pg_temp.adc_id(10);
insert into public.workspace_roles(id,ws_id,name)
values(pg_temp.adc_id(20),pg_temp.adc_id(10),'Report viewer');
insert into public.workspace_role_permissions(role_id,ws_id,permission,enabled)
values(pg_temp.adc_id(20),pg_temp.adc_id(10),'view_user_groups_reports',true);
insert into public.workspace_role_members(role_id,user_id) values(pg_temp.adc_id(20),pg_temp.adc_id(2));
insert into public.workspace_users(id,ws_id,full_name)
values(pg_temp.adc_id(30),pg_temp.adc_id(10),'Synthetic report user');
insert into public.workspace_user_groups(id,ws_id,name)
values(pg_temp.adc_id(40),pg_temp.adc_id(10),'Synthetic report group');
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,report_approval_status,updated_at)
values(pg_temp.adc_id(50),pg_temp.adc_id(30),pg_temp.adc_id(40),'Synthetic','Observed','Next','PENDING',now());
select ok(exists(select 1 from public.workspace_members where ws_id=pg_temp.adc_id(10)
  and user_id=pg_temp.adc_id(2)), 'viewer belongs to the target workspace');
select ok(public.has_workspace_permission(pg_temp.adc_id(10),pg_temp.adc_id(2),
  'view_user_groups_reports') is true, 'viewer holds the app report-view permission');
select ok(not exists(select 1 from public.workspace_members where ws_id=pg_temp.adc_id(10)
  and user_id=pg_temp.adc_id(3)), 'outsider is not a target-workspace member');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.get_bounce_complaint_stats(now())$$,'42501',null,'anon cannot read bounce stats');
select throws_ok($$select * from public.get_workspace_overview_summary()$$,'42501',null,'anon cannot read platform summary');
select throws_ok($$select * from public.create_missing_personal_workspaces()$$,'42501',null,'anon cannot run personal workspace maintenance');
select throws_ok($$select * from public.get_group_report_status_summary(pg_temp.adc_id(10))$$,'42501',null,'anon cannot read group summary');
select throws_ok($$select * from public.get_user_report_status_summary(pg_temp.adc_id(40),pg_temp.adc_id(10))$$,'42501',null,'anon cannot read user summary');
reset role;

-- Actual callers are admin-only. Temporarily admit authenticated in this rolled-
-- back test to prove the body guard independently of the production ACL fence.
grant execute on function public.get_group_report_status_summary(uuid),
  public.get_user_report_status_summary(uuid,uuid) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('role','authenticated','sub',pg_temp.adc_id(3))::text,true);
select throws_ok($$select * from public.get_group_report_status_summary(pg_temp.adc_id(10))$$,'42501','Permission denied','nonmember group read rejected by body guard');
select throws_ok($$select * from public.get_user_report_status_summary(pg_temp.adc_id(40),pg_temp.adc_id(10))$$,'42501','Permission denied','nonmember user read rejected by body guard');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select * from public.get_group_report_status_summary(pg_temp.adc_id(10))$$,'42501','Permission denied','missing uid group read rejected');
select throws_ok($$select * from public.get_user_report_status_summary(pg_temp.adc_id(40),pg_temp.adc_id(10))$$,'42501','Permission denied','missing uid user read rejected');
select set_config('request.jwt.claims',json_build_object('role','authenticated','sub',pg_temp.adc_id(2))::text,true);
select results_eq($$select group_id,pending_count,approved_count,rejected_count from public.get_group_report_status_summary(pg_temp.adc_id(10))$$,
  $$select pg_temp.adc_id(40),1::bigint,0::bigint,0::bigint$$,'permitted member reads exact group counts');
select results_eq($$select user_id,pending_count,approved_count,rejected_count from public.get_user_report_status_summary(pg_temp.adc_id(40),pg_temp.adc_id(10))$$,
  $$select pg_temp.adc_id(30),1::bigint,0::bigint,0::bigint$$,'permitted member reads exact user counts');
select throws_ok($$select * from public.get_group_report_status_summary(pg_temp.adc_id(11))$$,'42501','Permission denied','member cannot read another workspace');
reset role;
update public.workspace_role_permissions set enabled=false where role_id=pg_temp.adc_id(20);
set local role authenticated;
select throws_ok($$select * from public.get_group_report_status_summary(pg_temp.adc_id(10))$$,'42501','Permission denied','member without report permission denied');
select throws_ok($$select * from public.get_user_report_status_summary(pg_temp.adc_id(40),pg_temp.adc_id(10))$$,'42501','Permission denied','member without report permission denied on user summary');
reset role;

select ok(to_regprocedure('public.get_or_create_notification_batch(uuid,uuid,text,integer)') is null,'broken 4-arg overload removed');
select ok(to_regprocedure('public.get_or_create_notification_batch(uuid,uuid,text,integer,text)') is null,'broken 5-arg overload removed');
select ok(to_regprocedure('public.get_or_create_notification_batch(uuid,uuid,text,integer,text,public.notification_delivery_mode)') is not null,'working 6-arg overload retained');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select * from public.get_bounce_complaint_stats(now())$$,'service role reads bounce stats');
select lives_ok($$select * from public.get_workspace_overview_summary()$$,'service role reads overview summary');
select lives_ok($$select * from public.create_missing_personal_workspaces()$$,'service role runs maintenance');
select results_eq($$select group_id,pending_count from public.get_group_report_status_summary(pg_temp.adc_id(10))$$,
  $$select pg_temp.adc_id(40),1::bigint$$,'service role bypass works without uid');
select results_eq($$select user_id,pending_count from public.get_user_report_status_summary(pg_temp.adc_id(40),pg_temp.adc_id(10))$$,
  $$select pg_temp.adc_id(30),1::bigint$$,'service role reads user summary without uid');
select ok(public.get_or_create_notification_batch(null,null,'email',10,'adc-fixture@example.invalid','batched') is not null,
  'working overload creates a batch as service role');
reset role;
select is((select count(*) from private.notification_batches where email='adc-fixture@example.invalid'),1::bigint,
  'working overload persists exactly one private batch');
select * from finish();
rollback;
