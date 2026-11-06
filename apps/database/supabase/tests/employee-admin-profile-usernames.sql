begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000013001','profile-admin@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000013003','profile-foreign@example.test',now(),'{}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Profile fixture','00000000-0000-4000-8000-000000013001',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000013001','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
select private.employee_creation_preflight('00000000-0000-4000-8000-000000013001',
'00000000-0000-4000-8000-000000013002','profile-target@tuturuuu.com','Original Name');
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000013002','profile-target@tuturuuu.com',now(),now()+interval '100 years','{"employee_onboarding":true}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
select private.finalize_employee_creation('00000000-0000-4000-8000-000000013001',
'00000000-0000-4000-8000-000000013002','profile-target@tuturuuu.com','Original Name');
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000013002';
select private.confirm_employee_activation('00000000-0000-4000-8000-000000013001',
'00000000-0000-4000-8000-000000013002','profile-target@tuturuuu.com');
-- Model an established active profile; creation's initial name event is historical.
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000013002';
insert into private.employee_creation_operations(actor_id,operation_id,target_id,staff_email,managed_name,phase) values
('00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013010',
'00000000-0000-4000-8000-000000013002','profile-target@tuturuuu.com','Original Name','active');
create function pg_temp.profile_update(p_name text,p_handle text,p_revision bigint default 0,
p_operation uuid default '00000000-0000-4000-8000-000000013020') returns jsonb language sql as $$
select private.update_employee_profile('00000000-0000-4000-8000-000000013001',
'00000000-0000-4000-8000-000000013002','profile-target@tuturuuu.com',p_revision,p_operation,p_name,p_handle);
$$;
create function pg_temp.observe() returns jsonb language sql as $$
select private.employee_creation_runtime_inspect('00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013010');
$$;
create temporary table immutable_before as select
(select to_jsonb(a) from auth.users a where id='00000000-0000-4000-8000-000000013002') auth,
(select jsonb_agg(to_jsonb(a)) from auth.identities a where user_id='00000000-0000-4000-8000-000000013002') identities,
(select jsonb_agg(to_jsonb(a)) from public.workspace_members a where user_id='00000000-0000-4000-8000-000000013002') memberships,
(select to_jsonb(a) from public.platform_user_roles a where user_id='00000000-0000-4000-8000-000000013002') grants,
(select to_jsonb(a) from private.employee_creation_intents a where user_id='00000000-0000-4000-8000-000000013002') intent,
(select to_jsonb(a) from private.employee_creation_operations a where target_id='00000000-0000-4000-8000-000000013002') operation,
(select jsonb_agg(to_jsonb(a)) from private.employee_creation_operation_history a) history,
(select to_jsonb(m)-'display_name'-'sender_name'-'updated_at' from private.mail_mailboxes m join private.infrastructure_employees e on e.mailbox_id=m.id where e.user_id='00000000-0000-4000-8000-000000013002') mailbox;

select ok(not has_function_privilege('anon','private.employee_profile_handle_write_allowed(uuid,text)','EXECUTE'),'anon cannot invoke capability helper');
select ok(not has_function_privilege('authenticated','private.employee_profile_handle_write_allowed(uuid,text)','EXECUTE'),'ordinary role cannot invoke capability helper');
select ok(not has_function_privilege('service_role','private.employee_profile_handle_write_allowed(uuid,text)','EXECUTE'),'service cannot invoke bare helper');
select ok(not has_table_privilege('service_role','private.employee_profile_write_context','INSERT'),'service cannot mint capability');
select ok(not has_table_privilege('authenticated','private.employee_profile_write_context','INSERT'),'ordinary actor cannot mint capability');
set local role service_role;
select throws_ok($$select private.employee_profile_handle_write_allowed('00000000-0000-4000-8000-000000013002','hehe')$$,'42501',null,'bare service helper denied');
select throws_ok($$insert into private.employee_profile_write_context values(pg_backend_pid(),txid_current(),'00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','hehe')$$,'42501',null,'bare service permit insertion denied');
reset role;
select throws_ok($$select private.update_employee_profile('00000000-0000-4000-8000-000000013003','00000000-0000-4000-8000-000000013002','profile-target@tuturuuu.com',0,gen_random_uuid(),'Original Name','hehe')$$,'42501','Employee administrator access denied','ordinary actor denied at mutation entry');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000013003','{"handle":"q"}')$$,'22023','Invalid username','public self-service rejects 1 char');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000013003','{"handle":"hehe"}')$$,'22023','Invalid username','public self-service rejects 4 chars');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000013003',jsonb_build_object('handle',repeat('a',33)))$$,'22023','Invalid username','public self-service rejects 33 chars');
select throws_ok($$update public.users set handle='hehe' where id='00000000-0000-4000-8000-000000013002'$$,'22023','Invalid or reserved username','bare root profile UPDATE has no administrator exception');
select throws_ok($$insert into public.handles(value,creator_id) values(repeat('x',1001),'00000000-0000-4000-8000-000000013002')$$,'22001',null,'bare root reservation retains generic length cap');
set local role service_role;
select throws_ok($$update public.users set handle=repeat('x',81) where id='00000000-0000-4000-8000-000000013002'$$,'22023','Invalid or reserved username','bare service UPDATE has no exception');
select throws_ok($$insert into public.handles(value,creator_id) values(repeat('x',1001),'00000000-0000-4000-8000-000000013002')$$,'22001',null,'bare service reservation retains generic cap');
reset role;
select set_config('employee.profile_admin','true',true);
select throws_ok($$update public.users set handle='hehe' where id='00000000-0000-4000-8000-000000013002'$$,'22023','Invalid or reserved username','caller GUC grants no capability');
select throws_ok($$update public.users set bio=repeat('b',161) where id='00000000-0000-4000-8000-000000013002'$$,'22001',null,'unrelated generic profile limits retained');
insert into private.employee_profile_write_context values(pg_backend_pid(),txid_current(),'00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','other');
select ok(not private.employee_profile_handle_write_allowed('00000000-0000-4000-8000-000000013002','hehe'),'capability cannot authorize another handle');
select ok(not private.employee_profile_handle_write_allowed('00000000-0000-4000-8000-000000013003','other'),'capability cannot authorize another target');
update private.employee_profile_write_context set actor_id='00000000-0000-4000-8000-000000013003';
select throws_ok($$select private.employee_profile_handle_write_allowed('00000000-0000-4000-8000-000000013002','other')$$,'42501','Employee administrator access denied','capability checks fresh actor authority');
delete from private.employee_profile_write_context;
select throws_ok($$select pg_temp.profile_update('Duyên Dương','')$$,'22023','Invalid username','empty handle rejected');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','_hehe')$$,'22023','Invalid username','leading underscore rejected');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','Hehe')$$,'22023','Invalid username','uppercase rejected');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','he-he')$$,'22023','Invalid username','punctuation rejected');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','admin')$$,'22023','Invalid username','reserved names retained');
insert into public.handles(value,creator_id) values('dupe','00000000-0000-4000-8000-000000013003'),('none',null),(repeat('f',65),'00000000-0000-4000-8000-000000013003');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','dupe')$$,'23505','Username is unavailable','short foreign reservation rejected');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','none')$$,'23505','Username is unavailable','short NULL-owner reservation rejected');
select throws_ok($$select pg_temp.profile_update('Duyên Dương',repeat('f',65))$$,'23505','Username is unavailable','long duplicate reservation rejected');
select is((select count(*) from private.employee_profile_write_context),0::bigint,'failed writes leave no capability');
select is((select count(*) from private.employee_profile_renames),0::bigint,'failed writes leave no receipt');
select is(pg_temp.profile_update('Duyên Dương','q')->>'revision','1','administrator changes handle to 1 char');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000013002'),'q','1 char stored');
select is(pg_temp.profile_update('Duyên Dương','q')->>'revision','1','same operation returns original receipt');
select is((select count(*) from private.employee_profile_renames),1::bigint,'same operation does not append');
select is(private.inspect_employee_profile_operation('00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','profile-target@tuturuuu.com','00000000-0000-4000-8000-000000013020')->'receipt'->>'username','q','independent lost-ACK observation binds username');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','hehe')$$,'23505','Employee profile operation payload conflict','same operation cannot change handle');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','hehe',0,gen_random_uuid())$$,'23514','Employee profile preimage conflict','CAS rejects stale revision');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','hehe',1,gen_random_uuid())$$,'PT429','Username can be changed every 14 days','administrator still respects cooldown');
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000013002' and field='handle';
select is(pg_temp.profile_update('Duyên Dương','hehe',1,'00000000-0000-4000-8000-000000013021')->>'revision','2','administrator changes handle to 4 chars hehe');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000013002'),'hehe','4 chars hehe stored exactly');
select is((select creator_id from public.handles where value='hehe'),'00000000-0000-4000-8000-000000013002'::uuid,'4 chars hehe reservation belongs to target');
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000013002' and field='handle';
select is(pg_temp.profile_update('Duyên Dương',repeat('a',33),2,'00000000-0000-4000-8000-000000013022')->>'revision','3','administrator changes handle to 33 chars');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000013002'),repeat('a',33),'33 chars stored exactly');
select is((select creator_id from public.handles where value=repeat('a',33)),'00000000-0000-4000-8000-000000013002'::uuid,'33 chars reservation belongs to target');
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000013002' and field='handle';
select is(pg_temp.profile_update('Duyên Dương',repeat('b',65),3,'00000000-0000-4000-8000-000000013023')->>'revision','4','administrator changes handle to 65 chars');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000013002'),repeat('b',65),'65 chars stored exactly');
select is((select creator_id from public.handles where value=repeat('b',65)),'00000000-0000-4000-8000-000000013002'::uuid,'65 chars reservation belongs to target');
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000013002' and field='handle';
select is(pg_temp.profile_update('Duyên Dương',repeat('c',81),4,'00000000-0000-4000-8000-000000013024')->>'revision','5','administrator changes handle to 81 chars beyond users generic cap');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000013002'),repeat('c',81),'81 chars beyond users generic cap stored exactly');
select is((select creator_id from public.handles where value=repeat('c',81)),'00000000-0000-4000-8000-000000013002'::uuid,'81 chars beyond users generic cap reservation belongs to target');
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000013002' and field='handle';
select is(pg_temp.profile_update('Duyên Dương',repeat('x',1001),5,'00000000-0000-4000-8000-000000013025')->>'revision','6','administrator changes handle to 1001 chars beyond handles generic cap');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000013002'),repeat('x',1001),'1001 chars beyond handles generic cap stored exactly');
select is((select creator_id from public.handles where value=repeat('x',1001)),'00000000-0000-4000-8000-000000013002'::uuid,'1001 chars beyond handles generic cap reservation belongs to target');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000013003','{"handle":"q"}')$$,'22023','Invalid username','public remains strict after administrator capability closes');
select is((select count(*) from private.employee_profile_write_context),0::bigint,'successful writes leave no capability');
select is(pg_temp.observe()->'account'->>'displayName','Duyên Dương','CREATE current-name propagation retained');
select is(pg_temp.observe()->'account'->>'creationDisplayName','Original Name','CREATE original-name lineage retained');
select is((select full_name from public.user_private_details where user_id='00000000-0000-4000-8000-000000013002'),'Duyên Dương','private name propagated');
select ok((select m.display_name='Duyên Dương' and m.sender_name='Duyên Dương' from private.mail_mailboxes m join private.infrastructure_employees e on m.id=e.mailbox_id where e.user_id='00000000-0000-4000-8000-000000013002'),'mailbox names propagated');
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000013002' and field='handle';
select is(pg_temp.profile_update('Duyên Dương',null,6,'00000000-0000-4000-8000-000000013026')->>'revision','7','null clears long handle');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000013002'),null::text,'handle is null');
select is((select creator_id from public.handles where value=repeat('x',1001)),'00000000-0000-4000-8000-000000013002'::uuid,'long cleared handle remains owned');
select is((select count(*) from private.employee_profile_renames),7::bigint,'one receipt per successful operation');
delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000013001';
select throws_ok($$select pg_temp.profile_update('Duyên Dương',null,7,gen_random_uuid())$$,'42501','Employee administrator access denied','revoked administrator denied before mutation');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','q')$$,'42501','Employee administrator access denied','revoked administrator cannot replay receipt');
select is((select count(*) from private.employee_profile_write_context),0::bigint,'revocation cannot leave capability');
select is((select to_jsonb(a) from auth.users a where id='00000000-0000-4000-8000-000000013002'),(select auth from immutable_before),'Auth identity credentials metadata ban preserved');
select is((select jsonb_agg(to_jsonb(a)) from auth.identities a where user_id='00000000-0000-4000-8000-000000013002'),(select identities from immutable_before),'provider identities preserved');
select is((select jsonb_agg(to_jsonb(a)) from public.workspace_members a where user_id='00000000-0000-4000-8000-000000013002'),(select memberships from immutable_before),'memberships preserved');
select is((select to_jsonb(a) from public.platform_user_roles a where user_id='00000000-0000-4000-8000-000000013002'),(select grants from immutable_before),'grants preserved');
select is((select to_jsonb(a) from private.employee_creation_intents a where user_id='00000000-0000-4000-8000-000000013002'),(select intent from immutable_before),'CREATE intent unchanged');
select is((select to_jsonb(a) from private.employee_creation_operations a where target_id='00000000-0000-4000-8000-000000013002'),(select operation from immutable_before),'CREATE operation unchanged');
select is((select jsonb_agg(to_jsonb(a)) from private.employee_creation_operation_history a),(select history from immutable_before),'CREATE history unchanged');
select is((select to_jsonb(m)-'display_name'-'sender_name'-'updated_at' from private.mail_mailboxes m join private.infrastructure_employees e on e.mailbox_id=m.id where e.user_id='00000000-0000-4000-8000-000000013002'),(select mailbox from immutable_before),'mailbox UUID address and ownership preserved');
select * from finish();
rollback;
