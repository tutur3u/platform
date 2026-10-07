-- Synthetic rollback-only packet. Calls the real employee evaluator and RPCs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009920','administrator-fixture@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000009921','creator-fixture@tuturuuu.com',now(),'{}','{}');
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Root fixture','00000000-0000-4000-8000-000000009921',false),
('00000000-0000-4000-8000-000000009922','Foreign fixture','00000000-0000-4000-8000-000000009921',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009920','MEMBER'),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009921','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
-- Eliminate default/creator bypasses so malformed role negatives are causal.
update public.workspace_default_permissions set enabled=false where ws_id='00000000-0000-0000-0000-000000000000';
delete from public.workspace_role_members where user_id='00000000-0000-4000-8000-000000009920';
insert into public.workspace_roles(id,ws_id,name) values
('00000000-0000-4000-8000-000000009923','00000000-0000-4000-8000-000000009922','Foreign role fixture'),
('00000000-0000-4000-8000-000000009924','00000000-0000-0000-0000-000000000000','Root role fixture');
insert into public.workspace_role_members(role_id,user_id) values('00000000-0000-4000-8000-000000009923','00000000-0000-4000-8000-000000009920');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009923','admin',true);
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','foreign role with root admin permission is denied');
select throws_ok($$select private.employee_creation_preflight('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009925','denied-fixture@tuturuuu.com','Denied fixture')$$,'42501','Employee administrator access denied','foreign role admin cannot create intent');
update public.workspace_role_permissions set permission='manage_internal_accounts' where role_id='00000000-0000-4000-8000-000000009923';
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','foreign role with root explicit permission is denied');
select throws_ok($$select private.finalize_employee_creation('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009925','denied-fixture@tuturuuu.com','Denied fixture')$$,'42501','Employee administrator access denied','foreign explicit grant cannot reach finalization target lookup');
select ok(not exists(select 1 from private.employee_creation_intents where user_id='00000000-0000-4000-8000-000000009925'),'denied actor left no creation intent');
delete from public.workspace_role_members where user_id='00000000-0000-4000-8000-000000009920';
insert into public.workspace_role_members(role_id,user_id) values('00000000-0000-4000-8000-000000009924','00000000-0000-4000-8000-000000009920');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values
('00000000-0000-4000-8000-000000009922','00000000-0000-4000-8000-000000009924','admin',true);
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','root role with foreign admin permission is denied');
update public.workspace_role_permissions set permission='manage_internal_accounts' where role_id='00000000-0000-4000-8000-000000009924';
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','root role with foreign explicit permission is denied');
update public.workspace_role_permissions set ws_id='00000000-0000-0000-0000-000000000000' where role_id='00000000-0000-4000-8000-000000009924';
select lives_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'valid root role explicit grant permits employee operations');
select lives_ok($$select private.employee_creation_preflight('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009925','allowed-fixture@tuturuuu.com','Allowed fixture')$$,'valid explicit actor creates a retained intent');
update public.workspace_role_permissions set permission='admin' where role_id='00000000-0000-4000-8000-000000009924';
select lives_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'valid root role admin permits employee operations');
update public.workspace_role_permissions set enabled=false where role_id='00000000-0000-4000-8000-000000009924';
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','disabled root role grant is denied');
insert into public.workspace_default_permissions(ws_id,permission,member_type,enabled) values
('00000000-0000-0000-0000-000000000000','admin','MEMBER',true)
on conflict(ws_id,permission,member_type) do update set enabled=true;
select lives_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'root MEMBER default admin is valid');
update public.workspace_default_permissions set enabled=false where ws_id='00000000-0000-0000-0000-000000000000';
insert into public.workspace_default_permissions(ws_id,permission,member_type,enabled) values
('00000000-0000-0000-0000-000000000000','manage_internal_accounts','MEMBER',true)
on conflict(ws_id,permission,member_type) do update set enabled=true;
select lives_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'root MEMBER default explicit grant is valid');
update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-4000-8000-000000009920';
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','fresh ban overrides valid default grant');
update auth.users set banned_until=null,email_confirmed_at=null where id='00000000-0000-4000-8000-000000009920';
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','unconfirmed actor with valid grant is denied');
update auth.users set email_confirmed_at=now(),email='administrator-fixture@example.com' where id='00000000-0000-4000-8000-000000009920';
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','noncompany actor with valid grant is denied');
update auth.users set email='administrator-fixture@tuturuuu.com' where id='00000000-0000-4000-8000-000000009920';
update public.workspace_members set type='GUEST' where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000009920';
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','guest cannot consume MEMBER default grant');
update public.workspace_members set type='MEMBER' where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000009920';
update public.workspace_default_permissions set enabled=false where ws_id='00000000-0000-0000-0000-000000000000';
insert into public.workspace_default_permissions(ws_id,permission,member_type,enabled) values
('00000000-0000-0000-0000-000000000000','admin','GUEST',true)
on conflict(ws_id,permission,member_type) do update set enabled=true;
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009920')$$,'42501','Employee administrator access denied','MEMBER cannot consume GUEST default admin');
select lives_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009921')$$,'fresh root creator MEMBER needs no grant');
delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000009921';
select throws_ok($$select private.assert_employee_administrator('00000000-0000-4000-8000-000000009921')$$,'42501','Employee administrator access denied','creator without root MEMBER membership is denied');
select * from finish();
rollback;
