begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, private;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000910001','authenticated','authenticated','profile-fixture-0@example.invalid','{}',now(),now()),
('00000000-0000-0000-0000-000000910002','authenticated','authenticated','profile-fixture-1@example.invalid','{}',now(),now()),
('00000000-0000-0000-0000-000000910003','authenticated','authenticated','profile-fixture-2@example.invalid','{}',now(),now()),
('00000000-0000-0000-0000-000000910004','authenticated','authenticated','profile-fixture-3@example.invalid','{}',now(),now()),
('00000000-0000-0000-0000-000000910005','authenticated','authenticated','profile-fixture-4@example.invalid','{}',now(),now());
insert into public.users(id) values ('00000000-0000-0000-0000-000000910001'),('00000000-0000-0000-0000-000000910002'),('00000000-0000-0000-0000-000000910003'),('00000000-0000-0000-0000-000000910004'),('00000000-0000-0000-0000-000000910005') on conflict (id) do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
('00000000-0000-0000-0000-000000910010','User Access Fixture',false,'00000000-0000-0000-0000-000000910001'),('00000000-0000-0000-0000-000000910011','Foreign Access Fixture',false,'00000000-0000-0000-0000-000000910005');
update public.workspace_default_permissions set enabled=false where ws_id in ('00000000-0000-0000-0000-000000910010','00000000-0000-0000-0000-000000910011');
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000910010','00000000-0000-0000-0000-000000910002','MEMBER'),('00000000-0000-0000-0000-000000910010','00000000-0000-0000-0000-000000910003','MEMBER'),('00000000-0000-0000-0000-000000910010','00000000-0000-0000-0000-000000910004','GUEST')
on conflict (ws_id,user_id) do update set type=excluded.type;
insert into public.workspace_roles(id,ws_id,name) values ('00000000-0000-0000-0000-000000910020','00000000-0000-0000-0000-000000910010','Profile Fixture');
insert into public.workspace_role_members(role_id,user_id) values ('00000000-0000-0000-0000-000000910020','00000000-0000-0000-0000-000000910003');
insert into public.workspace_role_permissions(role_id,ws_id,permission,enabled)
select '00000000-0000-0000-0000-000000910020'::uuid,'00000000-0000-0000-0000-000000910010'::uuid,p::public.workspace_role_permission,true
from unnest(array['view_users_public_info','view_users_private_info','create_users','update_users','delete_users','check_user_attendance','view_user_groups_scores','create_user_groups_scores','update_user_groups_scores','delete_user_groups_scores']) p;
insert into public.workspace_users(id,ws_id,display_name) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910010','Synthetic profile'),('00000000-0000-0000-0000-000000910041','00000000-0000-0000-0000-000000910011','Foreign profile');
insert into public.workspace_user_groups(id,ws_id,name) values ('00000000-0000-0000-0000-000000910030','00000000-0000-0000-0000-000000910010','Fixture class'),('00000000-0000-0000-0000-000000910031','00000000-0000-0000-0000-000000910011','Foreign class');
insert into public.user_group_metrics(id,ws_id,name,unit) values ('00000000-0000-0000-0000-000000910050','00000000-0000-0000-0000-000000910010','Fixture metric','points'),('00000000-0000-0000-0000-000000910051','00000000-0000-0000-0000-000000910011','Foreign metric','points');
insert into public.user_group_attendance(id,user_id,group_id,date,status) values ('00000000-0000-0000-0000-000000910060','00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910030','2026-01-01','PRESENT');
insert into public.user_indicators(user_id,indicator_id,value) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910050',5);
select ok(not has_table_privilege('authenticated','public.workspace_users','select'),'profile content uses gated adapters');
select ok(has_column_privilege('authenticated','public.workspace_users','id','select'),'policy joins retain identifiers');
select ok(not has_column_privilege('authenticated','public.workspace_users','national_id','select'),'private column unavailable directly');
select ok(not has_table_privilege('authenticated','public.workspace_users','truncate'),'bulk operation cannot skip row policies');
select ok(not has_table_privilege('authenticated','public.workspace_users_with_groups','select'),'directory view uses gated adapters');
select ok(not exists (
  select 1 from pg_attribute a where a.attrelid='public.workspace_users'::regclass and a.attnum>0 and not a.attisdropped
  and a.attname not in ('id','ws_id') and has_column_privilege('authenticated',a.attrelid,a.attname,'select')
),'all content column grants are closed including inherited grants');
select ok(not has_table_privilege('authenticated','public.group_with_attendance','select'),'group summary uses gated adapters');
select ok(not has_table_privilege('authenticated','public.group_user_with_attendance','select'),'group attendance view uses gated adapters');
select ok(not has_table_privilege('authenticated','public.group_users_with_post_checks','select'),'group check view uses gated adapters');


set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000910002","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::int from public.workspace_users where id='00000000-0000-0000-0000-000000910040'),0,'member without permission: profiles hidden');
select throws_ok($$insert into public.workspace_users(ws_id,display_name) values ('00000000-0000-0000-0000-000000910010','Denied fixture')$$,'42501',null,'member without permission: profile insert denied');
with changed as (update public.workspace_users set display_name='Denied' where id='00000000-0000-0000-0000-000000910040' returning id) select is(count(*)::int,0,'member without permission: profile update denied') from changed;
with changed as (delete from public.workspace_users where id='00000000-0000-0000-0000-000000910040' returning id) select is(count(*)::int,0,'member without permission: profile delete denied') from changed;
select is((select count(*)::int from public.user_group_attendance where id='00000000-0000-0000-0000-000000910060'),0,'member without permission: attendance hidden');
select throws_ok($$insert into public.user_group_attendance(user_id,group_id,date,status) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910030','2026-01-02','PRESENT')$$,'42501',null,'member without permission: attendance insert denied');
with changed as (update public.user_group_attendance set status='ABSENT' where id='00000000-0000-0000-0000-000000910060' returning id) select is(count(*)::int,0,'member without permission: attendance update denied') from changed;
with changed as (delete from public.user_group_attendance where id='00000000-0000-0000-0000-000000910060' returning id) select is(count(*)::int,0,'member without permission: attendance delete denied') from changed;
select is((select count(*)::int from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040'),0,'member without permission: scores hidden');
select throws_ok($$insert into public.user_indicators(user_id,indicator_id,value) values ('00000000-0000-0000-0000-000000910041','00000000-0000-0000-0000-000000910050',7)$$,'42501',null,'member without permission: score insert denied');
with changed as (update public.user_indicators set value=7 where user_id='00000000-0000-0000-0000-000000910040' returning user_id) select is(count(*)::int,0,'member without permission: score update denied') from changed;
with changed as (delete from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040' returning user_id) select is(count(*)::int,0,'member without permission: score delete denied') from changed;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000910004","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::int from public.workspace_users where id='00000000-0000-0000-0000-000000910040'),0,'guest: profiles hidden');
select throws_ok($$insert into public.workspace_users(ws_id,display_name) values ('00000000-0000-0000-0000-000000910010','Denied fixture')$$,'42501',null,'guest: profile insert denied');
with changed as (update public.workspace_users set display_name='Denied' where id='00000000-0000-0000-0000-000000910040' returning id) select is(count(*)::int,0,'guest: profile update denied') from changed;
with changed as (delete from public.workspace_users where id='00000000-0000-0000-0000-000000910040' returning id) select is(count(*)::int,0,'guest: profile delete denied') from changed;
select is((select count(*)::int from public.user_group_attendance where id='00000000-0000-0000-0000-000000910060'),0,'guest: attendance hidden');
select throws_ok($$insert into public.user_group_attendance(user_id,group_id,date,status) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910030','2026-01-02','PRESENT')$$,'42501',null,'guest: attendance insert denied');
with changed as (update public.user_group_attendance set status='ABSENT' where id='00000000-0000-0000-0000-000000910060' returning id) select is(count(*)::int,0,'guest: attendance update denied') from changed;
with changed as (delete from public.user_group_attendance where id='00000000-0000-0000-0000-000000910060' returning id) select is(count(*)::int,0,'guest: attendance delete denied') from changed;
select is((select count(*)::int from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040'),0,'guest: scores hidden');
select throws_ok($$insert into public.user_indicators(user_id,indicator_id,value) values ('00000000-0000-0000-0000-000000910041','00000000-0000-0000-0000-000000910050',7)$$,'42501',null,'guest: score insert denied');
with changed as (update public.user_indicators set value=7 where user_id='00000000-0000-0000-0000-000000910040' returning user_id) select is(count(*)::int,0,'guest: score update denied') from changed;
with changed as (delete from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040' returning user_id) select is(count(*)::int,0,'guest: score delete denied') from changed;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000910005","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::int from public.workspace_users where id='00000000-0000-0000-0000-000000910040'),0,'foreign workspace member: profiles hidden');
select throws_ok($$insert into public.workspace_users(ws_id,display_name) values ('00000000-0000-0000-0000-000000910010','Denied fixture')$$,'42501',null,'foreign workspace member: profile insert denied');
with changed as (update public.workspace_users set display_name='Denied' where id='00000000-0000-0000-0000-000000910040' returning id) select is(count(*)::int,0,'foreign workspace member: profile update denied') from changed;
with changed as (delete from public.workspace_users where id='00000000-0000-0000-0000-000000910040' returning id) select is(count(*)::int,0,'foreign workspace member: profile delete denied') from changed;
select is((select count(*)::int from public.user_group_attendance where id='00000000-0000-0000-0000-000000910060'),0,'foreign workspace member: attendance hidden');
select throws_ok($$insert into public.user_group_attendance(user_id,group_id,date,status) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910030','2026-01-02','PRESENT')$$,'42501',null,'foreign workspace member: attendance insert denied');
with changed as (update public.user_group_attendance set status='ABSENT' where id='00000000-0000-0000-0000-000000910060' returning id) select is(count(*)::int,0,'foreign workspace member: attendance update denied') from changed;
with changed as (delete from public.user_group_attendance where id='00000000-0000-0000-0000-000000910060' returning id) select is(count(*)::int,0,'foreign workspace member: attendance delete denied') from changed;
select is((select count(*)::int from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040'),0,'foreign workspace member: scores hidden');
select throws_ok($$insert into public.user_indicators(user_id,indicator_id,value) values ('00000000-0000-0000-0000-000000910041','00000000-0000-0000-0000-000000910050',7)$$,'42501',null,'foreign workspace member: score insert denied');
with changed as (update public.user_indicators set value=7 where user_id='00000000-0000-0000-0000-000000910040' returning user_id) select is(count(*)::int,0,'foreign workspace member: score update denied') from changed;
with changed as (delete from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040' returning user_id) select is(count(*)::int,0,'foreign workspace member: score delete denied') from changed;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000910003","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::int from public.workspace_users where id='00000000-0000-0000-0000-000000910040'),1,'permitted member reads identifiers');
select throws_ok($$select national_id from public.workspace_users where id='00000000-0000-0000-0000-000000910040'$$,'42501',null,'private profile data requires adapter even with permission');
select throws_ok($$select * from public.workspace_users where id='00000000-0000-0000-0000-000000910040'$$,'42501',null,'wildcard profile reads require adapter');
select throws_ok($$update public.workspace_users set display_name='Return fixture' where id='00000000-0000-0000-0000-000000910040' returning national_id$$,'42501',null,'write returning cannot read private data');
select lives_ok($$insert into public.workspace_users(id,ws_id,display_name) values ('00000000-0000-0000-0000-000000910042','00000000-0000-0000-0000-000000910010','Permitted fixture')$$,'permitted profile insert');
with changed as (update public.workspace_users set display_name='Allowed' where id='00000000-0000-0000-0000-000000910042' returning id) select is(count(*)::int,1,'permitted profile update') from changed;
with changed as (delete from public.workspace_users where id='00000000-0000-0000-0000-000000910042' returning id) select is(count(*)::int,1,'permitted profile delete') from changed;
select is((select count(*)::int from public.user_group_attendance where id='00000000-0000-0000-0000-000000910060'),1,'permitted attendance read');
select lives_ok($$insert into public.user_group_attendance(user_id,group_id,date,status) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910030','2026-01-03','PRESENT')$$,'permitted attendance insert');
with changed as (update public.user_group_attendance set status='ABSENT' where id='00000000-0000-0000-0000-000000910060' returning id) select is(count(*)::int,1,'permitted attendance update') from changed;
with changed as (delete from public.user_group_attendance where id='00000000-0000-0000-0000-000000910060' returning id) select is(count(*)::int,1,'permitted attendance delete') from changed;
select is((select count(*)::int from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040'),1,'permitted score read');
with changed as (update public.user_indicators set value=8 where user_id='00000000-0000-0000-0000-000000910040' returning user_id) select is(count(*)::int,1,'permitted score update') from changed;
with changed as (delete from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040' returning user_id) select is(count(*)::int,1,'permitted score delete') from changed;
select lives_ok($$insert into public.user_indicators(user_id,indicator_id,value) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910050',9)$$,'permitted score insert');
select throws_ok($$insert into public.user_group_attendance(user_id,group_id,date,status) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910031','2026-01-04','PRESENT')$$,'42501',null,'attendance references share workspace');
select throws_ok($$insert into public.user_indicators(user_id,indicator_id,value) values ('00000000-0000-0000-0000-000000910041','00000000-0000-0000-0000-000000910050',10)$$,'42501',null,'score references share workspace');
select throws_ok($$update public.workspace_users set ws_id='00000000-0000-0000-0000-000000910011' where id='00000000-0000-0000-0000-000000910040'$$,'42501',null,'profile cannot move across workspace boundary');


reset role;
insert into public.workspace_members(ws_id,user_id,type)
values ('00000000-0000-0000-0000-000000910011','00000000-0000-0000-0000-000000910003','MEMBER');
insert into public.workspace_roles(id,ws_id,name)
values ('00000000-0000-0000-0000-000000910021','00000000-0000-0000-0000-000000910011','Destination reader');
insert into public.workspace_role_members(role_id,user_id)
values ('00000000-0000-0000-0000-000000910021','00000000-0000-0000-0000-000000910003');
insert into public.workspace_role_permissions(role_id,ws_id,permission,enabled)
values ('00000000-0000-0000-0000-000000910021','00000000-0000-0000-0000-000000910011','view_users_public_info',true);
set local role authenticated;
select is((select count(*)::int from public.workspace_users where id='00000000-0000-0000-0000-000000910041'),1,'destination workspace is readable');
select throws_ok($$update public.workspace_users set ws_id='00000000-0000-0000-0000-000000910011' where id='00000000-0000-0000-0000-000000910040'$$,'42501',null,'readable destination without update permission denies row move');
reset role;
update public.workspace_role_permissions set enabled=false
where role_id='00000000-0000-0000-0000-000000910020' and permission='delete_users';
set local role authenticated;
with changed as (update public.workspace_users set display_name='Update-only member' where id='00000000-0000-0000-0000-000000910040' returning id)
select is(count(*)::int,1,'update-only member can update') from changed;
with changed as (delete from public.workspace_users where id='00000000-0000-0000-0000-000000910040' returning id)
select is(count(*)::int,0,'update-only member cannot delete') from changed;
reset role;
update public.workspace_role_permissions set enabled=true
where role_id='00000000-0000-0000-0000-000000910020' and permission='delete_users';

reset role;
insert into public.workspace_role_permissions(role_id,ws_id,permission,enabled)
values ('00000000-0000-0000-0000-000000910020','00000000-0000-0000-0000-000000910010','manage_workspace_audit_logs',true);
update public.workspace_role_permissions set enabled=false
where role_id='00000000-0000-0000-0000-000000910020' and permission='view_users_private_info';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000910003","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select count(*) from public.workspace_user_audit_filtered_feed('00000000-0000-0000-0000-000000910010','2026-01-01','2026-12-31')$$,'42501','workspace_user_audit_permission_denied','audit content requires private profile permission');
reset role;
update public.workspace_role_permissions set enabled=true
where role_id='00000000-0000-0000-0000-000000910020' and permission='view_users_private_info';
set local role authenticated;
select lives_ok($$select count(*) from public.workspace_user_audit_filtered_feed('00000000-0000-0000-0000-000000910010','2026-01-01','2026-12-31')$$,'audit and private permissions allow audit content');
reset role;

reset role;
insert into public.workspace_users(id,ws_id,display_name)
values ('00000000-0000-0000-0000-000000910045','00000000-0000-0000-0000-000000910010','Read-only fixture');
update public.workspace_role_permissions set enabled=false
where role_id='00000000-0000-0000-0000-000000910020' and permission in
('create_users','update_users','delete_users','check_user_attendance','create_user_groups_scores','update_user_groups_scores','delete_user_groups_scores');
set local role authenticated;
select is((select count(*)::int from public.workspace_users where id='00000000-0000-0000-0000-000000910040'),1,'read-only member retains profile identifiers');
select throws_ok($$insert into public.workspace_users(ws_id,display_name) values ('00000000-0000-0000-0000-000000910010','Denied write')$$,'42501',null,'profile read permission cannot create');
with changed as (update public.workspace_users set display_name='Denied write' where id='00000000-0000-0000-0000-000000910040' returning id)
select is(count(*)::int,0,'profile read permission cannot update') from changed;
with changed as (delete from public.workspace_users where id='00000000-0000-0000-0000-000000910040' returning id)
select is(count(*)::int,0,'profile read permission cannot delete') from changed;
select is((select count(*)::int from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040'),1,'read-only member retains score reads');
select throws_ok($$insert into public.user_indicators(user_id,indicator_id,value) values ('00000000-0000-0000-0000-000000910045','00000000-0000-0000-0000-000000910050',1)$$,'42501',null,'score read permission cannot create');
with changed as (update public.user_indicators set value=1 where user_id='00000000-0000-0000-0000-000000910040' returning user_id)
select is(count(*)::int,0,'score read permission cannot update') from changed;
with changed as (delete from public.user_indicators where user_id='00000000-0000-0000-0000-000000910040' returning user_id)
select is(count(*)::int,0,'score read permission cannot delete') from changed;
select is((select count(*)::int from public.user_group_attendance where user_id='00000000-0000-0000-0000-000000910040'),0,'profile read permission cannot read attendance');
select throws_ok($$insert into public.user_group_attendance(user_id,group_id,date,status) values ('00000000-0000-0000-0000-000000910040','00000000-0000-0000-0000-000000910030','2026-01-05','PRESENT')$$,'42501',null,'profile read permission cannot create attendance');
with changed as (update public.user_group_attendance set status='ABSENT' where user_id='00000000-0000-0000-0000-000000910040' returning id)
select is(count(*)::int,0,'profile read permission cannot update attendance') from changed;
with changed as (delete from public.user_group_attendance where user_id='00000000-0000-0000-0000-000000910040' returning id)
select is(count(*)::int,0,'profile read permission cannot delete attendance') from changed;
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*)::int from public.workspace_users where id='00000000-0000-0000-0000-000000910040'),1,'server adapters retain profile access');
select lives_ok($$select national_id from public.workspace_users where id='00000000-0000-0000-0000-000000910040'$$,'server adapters retain content columns');
reset role;


select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('workspace_users_with_groups','group_with_attendance','group_user_with_attendance','group_users_with_post_checks','distinct_invoice_creators','distinct_transaction_creators')
  and has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
),'dead view privileges are absent for authenticated including inherited grants');
select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('workspace_users_with_groups','group_with_attendance','group_user_with_attendance','group_users_with_post_checks','distinct_invoice_creators','distinct_transaction_creators')
  and has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
),'dead view privileges are absent for anon including PUBLIC grants');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('get_workspace_users','get_workspace_users_count','is_user_guest','get_featured_group_counts')
  and has_function_privilege('authenticated',p.oid,'EXECUTE')
),'server-only directory RPCs deny authenticated execution');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('get_workspace_users','get_workspace_users_count','is_user_guest','get_featured_group_counts')
  and has_function_privilege('anon',p.oid,'EXECUTE')
),'server-only directory RPCs deny anon and PUBLIC execution');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('get_workspace_users','get_workspace_users_count','is_user_guest','get_featured_group_counts')
  and not has_function_privilege('service_role',p.oid,'EXECUTE')
),'server-only directory RPCs retain service execution');

select * from finish();
rollback;
