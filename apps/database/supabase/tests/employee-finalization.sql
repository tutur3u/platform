begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009910','actor-fixture@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000009911','foreign-fixture@example.com',now(),'{}','{}');
insert into public.workspaces(id,name,creator_id,personal) values('00000000-0000-0000-0000-000000000000','Root fixture','00000000-0000-4000-8000-000000009910',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009910','MEMBER') on conflict(ws_id,user_id) do update set type='MEMBER';
select private.employee_creation_preflight('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com','Managed fixture');
select ok(not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000009912') and not exists(select 1 from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000009912'),'preflight-only recipient has no Auth identity or employee registry');
select is(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com')),jsonb_build_object('managed',true,'mailbox',null),'retained intent alone blocks exact and catch-all routing before Auth INSERT');
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com',now(),now()+interval '100 years','{"employee_onboarding":true}','{"display_name":"Managed fixture","full_name":"Managed fixture"}');
select throws_ok($$select private.employee_creation_preflight('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009914','finalize-fixture@tuturuuu.com','Changed fixture')$$,'23505','Employee account or reservation already exists','second request cannot retry or take over retained intent');
select lives_ok($$select private.employee_creation_preflight('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009913','new-fixture@tuturuuu.com','New fixture')$$,'fresh root actor can preflight');
update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-4000-8000-000000009910';
select throws_ok($$select private.finalize_employee_creation('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com','Managed fixture')$$,'42501','Employee administrator access denied','fresh actor ban blocks finalization');
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000009910';
insert into private.mail_mailboxes(address,domain_id,type,display_name,created_by) select 'finalize-fixture@tuturuuu.com',id,'personal','Foreign fixture','00000000-0000-4000-8000-000000009911' from private.mail_domains where domain='tuturuuu.com';
insert into private.mail_mailbox_members(mailbox_id,user_id,role) select id,'00000000-0000-4000-8000-000000009911','owner' from private.mail_mailboxes where address='finalize-fixture@tuturuuu.com';
select throws_ok($$select private.finalize_employee_creation('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com','Managed fixture')$$,'23505','Employee mailbox is unavailable','foreign mailbox cannot be taken over');
select ok((select banned_until>now() from auth.users where id='00000000-0000-4000-8000-000000009912'),'conflict never activates account');
select is((select lifecycle_state from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000009912'),'pending','conflict rolls back registry transition');
select ok((select display_name is null from public.users where id='00000000-0000-4000-8000-000000009912'),'conflict rolls back profile update');
select is((select user_id::text from private.mail_mailbox_members mm join private.mail_mailboxes mb on mb.id=mm.mailbox_id where mb.address='finalize-fixture@tuturuuu.com' and mm.role='owner'),'00000000-0000-4000-8000-000000009911','foreign ownership preserved');
delete from private.mail_mailboxes where address='finalize-fixture@tuturuuu.com';
update private.mail_domains set status='disabled' where domain='tuturuuu.com';
select throws_ok($$select private.finalize_employee_creation('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com','Managed fixture')$$,'23505','Employee mail domain is unavailable','inactive canonical domain rolls back provisioning');
update private.mail_domains set status='active' where domain='tuturuuu.com';
-- Fault the real membership insert, not a copied provisioning model.
create function pg_temp.fail_employee_member() returns trigger language plpgsql as $$begin raise exception using errcode='23514',message='Synthetic membership fault'; end$$;
create trigger fixture_employee_member_fault before insert on private.mail_mailbox_members for each row execute function pg_temp.fail_employee_member();
select throws_ok($$select private.finalize_employee_creation('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com','Managed fixture')$$,'23514','Synthetic membership fault','membership failure rolls back entire finalization');
select ok(not exists(select 1 from private.mail_mailboxes where address='finalize-fixture@tuturuuu.com'),'membership failure leaves no orphan mailbox');
select is((select lifecycle_state from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000009912'),'pending','membership failure retains pending');
drop trigger fixture_employee_member_fault on private.mail_mailbox_members;
select lives_ok($$select private.finalize_employee_creation('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com','Managed fixture')$$,'valid finalization provisions atomically');
select is((select display_name from public.users where id='00000000-0000-4000-8000-000000009912'),'Managed fixture','public display name synchronized');
select is((select full_name from public.user_private_details where user_id='00000000-0000-4000-8000-000000009912'),'Managed fixture','private full name synchronized');
select ok((select display_name='Managed fixture' and sender_name='Managed fixture' from private.mail_mailboxes where address='finalize-fixture@tuturuuu.com'),'mail display and sender synchronized');
select throws_ok($$select private.confirm_employee_activation('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com')$$,'23514','Employee activation is not confirmed','provisioned banned user cannot claim created');
-- Test-only auth schema write simulates provider activation, never production SQL.
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000009912';
select throws_ok($$select private.employee_access_preflight('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com',false)$$,'23514','Employee access is not confirmed','ordinary enable cannot complete a provisioned creation');
select is(private.confirm_employee_activation('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com')->>'status','created','only final schema read confirms active creation');
select ok(not (select enabled or allow_role_management from public.platform_user_roles where user_id='00000000-0000-4000-8000-000000009912'),'successful provisioning does not grant platform privileges');
select lives_ok($$select private.employee_access_preflight('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com',true)$$,'active employee enable checks exact managed state');
select ok(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com'))->'mailbox'->>'id' is not null,'active owned employee mailbox resolves exactly');
-- Rollback-only provider-state fixtures exercise the lookup before the deferred
-- commit guard. Restore the exact boolean marker before any deferred check.
update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{employee_onboarding}','false'::jsonb) where id='00000000-0000-4000-8000-000000009912';
select is(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com')),jsonb_build_object('managed',true,'mailbox',null),'false employee marker denies exact delivery and ordinary catch-all fallback');
update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{employee_onboarding}','"true"'::jsonb) where id='00000000-0000-4000-8000-000000009912';
select is(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com')),jsonb_build_object('managed',true,'mailbox',null),'string employee marker denies exact delivery and ordinary catch-all fallback');
update auth.users set raw_app_meta_data=raw_app_meta_data-'employee_onboarding' where id='00000000-0000-4000-8000-000000009912';
select is(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com')),jsonb_build_object('managed',true,'mailbox',null),'missing employee marker denies exact delivery and ordinary catch-all fallback');
update auth.users set raw_app_meta_data=raw_app_meta_data||'{"employee_onboarding":true}'::jsonb where id='00000000-0000-4000-8000-000000009912';
update private.mail_mailboxes set status='disabled' where address='finalize-fixture@tuturuuu.com';
select is(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com'))->'mailbox','null'::jsonb,'disabled employee recipient blocks catch-all');
update private.mail_mailboxes set status='active' where address='finalize-fixture@tuturuuu.com';
update private.mail_mailbox_members set user_id='00000000-0000-4000-8000-000000009911' where mailbox_id=(select id from private.mail_mailboxes where address='finalize-fixture@tuturuuu.com');
select is(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com'))->'mailbox','null'::jsonb,'foreign owner blocks employee inbound delivery');
select throws_ok($$select private.employee_access_preflight('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com',false)$$,'23514','Employee access is not confirmed','foreign owner blocks restoration');
update private.mail_mailbox_members set user_id='00000000-0000-4000-8000-000000009912' where mailbox_id=(select id from private.mail_mailboxes where address='finalize-fixture@tuturuuu.com');
update private.mail_domains set status='disabled' where domain='tuturuuu.com';
select is(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com'))->'mailbox','null'::jsonb,'inactive domain blocks employee delivery');
update private.mail_domains set status='active' where domain='tuturuuu.com';
update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-4000-8000-000000009912';
select is(private.employee_inbound_mailbox('finalize-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com'))->'mailbox','null'::jsonb,'banned employee mail cannot fall into catch-all');
select lives_ok($$select private.employee_access_preflight('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009912','finalize-fixture@tuturuuu.com',false)$$,'disabled fully provisioned employee can pass restoration preflight');
select is(private.employee_inbound_mailbox('unknown-fixture@tuturuuu.com',(select id from private.mail_domains where domain='tuturuuu.com'))->>'managed','false','ordinary unknown recipient retains legacy catch-all policy');
select * from finish();
rollback;
