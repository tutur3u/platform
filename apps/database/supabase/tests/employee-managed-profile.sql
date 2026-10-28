begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000012001','profile-admin@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000012003','profile-foreign@example.test',now(),'{}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Profile fixture','00000000-0000-4000-8000-000000012001',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000012001','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
select private.employee_creation_preflight('00000000-0000-4000-8000-000000012001',
'00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com','Original Name');
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com',now(),now()+interval '100 years','{"employee_onboarding":true}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
select private.finalize_employee_creation('00000000-0000-4000-8000-000000012001',
'00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com','Original Name');
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000012002';
select private.confirm_employee_activation('00000000-0000-4000-8000-000000012001',
'00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com');
-- Model an established active profile; creation's initial name event is historical.
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000012002';
insert into private.employee_creation_operations(actor_id,operation_id,target_id,staff_email,managed_name,phase) values
('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012010',
'00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com','Original Name','active');
create function pg_temp.profile_update(p_name text,p_handle text,p_revision bigint default 0,
p_operation uuid default '00000000-0000-4000-8000-000000012020') returns jsonb language sql as $$
select private.update_employee_profile('00000000-0000-4000-8000-000000012001',
'00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com',p_revision,p_operation,p_name,p_handle);
$$;
create function pg_temp.observe() returns jsonb language sql as $$
select private.employee_creation_runtime_inspect('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012010');
$$;
create temporary table immutable_before as select
(select to_jsonb(a) from auth.users a where id='00000000-0000-4000-8000-000000012002') auth,
(select jsonb_agg(to_jsonb(a)) from auth.identities a where user_id='00000000-0000-4000-8000-000000012002') identities,
(select jsonb_agg(to_jsonb(a)) from public.workspace_members a where user_id='00000000-0000-4000-8000-000000012002') memberships,
(select to_jsonb(a) from public.platform_user_roles a where user_id='00000000-0000-4000-8000-000000012002') grants,
(select to_jsonb(a) from private.employee_creation_intents a where user_id='00000000-0000-4000-8000-000000012002') intent,
(select to_jsonb(a) from private.employee_creation_operations a where target_id='00000000-0000-4000-8000-000000012002') operation,
(select jsonb_agg(to_jsonb(a)) from private.employee_creation_operation_history a) history,
(select to_jsonb(m)-'display_name'-'sender_name'-'updated_at' from private.mail_mailboxes m join private.infrastructure_employees e on e.mailbox_id=m.id where e.user_id='00000000-0000-4000-8000-000000012002') mailbox;
select ok(not has_function_privilege('authenticated','private.update_employee_profile(uuid,uuid,text,bigint,uuid,text,text)','EXECUTE'),'authenticated cannot rename');
select ok(not has_function_privilege('anon','private.update_employee_profile(uuid,uuid,text,bigint,uuid,text,text)','EXECUTE'),'anon cannot rename');
select ok(has_function_privilege('service_role','private.update_employee_profile(uuid,uuid,text,bigint,uuid,text,text)','EXECUTE'),'service transport admitted');
select throws_ok($$update public.users set display_name='Unapproved' where id='00000000-0000-4000-8000-000000012002'$$,'42501','Employee name is administrator managed','public guard retained');
select throws_ok($$update public.user_private_details set full_name='Unapproved' where user_id='00000000-0000-4000-8000-000000012002'$$,'42501','Employee name is administrator managed','private guard retained');
insert into public.handles(value,creator_id) values('foreignprofile','00000000-0000-4000-8000-000000012003'),('nullprofile',null);
select throws_ok($$select pg_temp.profile_update('Duyên Dương','foreignprofile')$$,'23505','Username is unavailable','foreign handle denied');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','nullprofile')$$,'23505','Username is unavailable','NULL owner not adopted');
select throws_ok($$select pg_temp.profile_update('Duyên Dương','admin')$$,'22023','Invalid username','reserved handle denied');
select is((select managed_name from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000012002'),'Original Name','failed updates rollback registry');
select is((select count(*) from private.employee_profile_renames),0::bigint,'failure leaves no provenance');
select is((select count(*) from private.user_profile_change_events where user_id='00000000-0000-4000-8000-000000012002' and field='handle'),0::bigint,'failure leaves no quota event');
select is(pg_temp.profile_update('Duyên Dương','duyenduong')->>'revision','1','Unicode and handle atomic rename');
select is((select display_name from public.users where id='00000000-0000-4000-8000-000000012002'),'Duyên Dương','public name agrees');
select is((select full_name from public.user_private_details where user_id='00000000-0000-4000-8000-000000012002'),'Duyên Dương','private name agrees');
select ok((select m.display_name='Duyên Dương' and m.sender_name='Duyên Dương' from private.mail_mailboxes m join private.infrastructure_employees e on m.id=e.mailbox_id where e.user_id='00000000-0000-4000-8000-000000012002'),'canonical mailbox names agree');
select is(pg_temp.observe()->'account'->>'displayName','Duyên Dương','CREATE observation shows real current name');
select is(pg_temp.observe()->'account'->>'creationDisplayName','Original Name','CREATE observation binds immutable intent');
select is(pg_temp.observe()->'operation'->>'displayName','Original Name','original operation name preserved');
select is(pg_temp.profile_update('Duyên Dương','duyenduong')->>'revision','1','exact replay returns original receipt');
select is((select count(*) from private.employee_profile_renames),1::bigint,'replay does not append');
select throws_ok($$select pg_temp.profile_update('Other','duyenduong')$$,'23505','Employee profile operation payload conflict','operation payload bound');
select throws_ok($$select pg_temp.profile_update('Other','duyenduong',0,gen_random_uuid())$$,'23514','Employee profile preimage conflict','stale revision rejected');
select throws_ok($$select pg_temp.profile_update('Other','anotherprofile',1,gen_random_uuid())$$,'PT429','Username can be changed every 14 days','cooldown retained');
select is((select count(*) from public.handles where value='anotherprofile'),0::bigint,'cooldown rolls back new handle');
select is((select revision from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000012002'),1::bigint,'cooldown rolls back revision');
select is(pg_temp.profile_update('Duyên Dương II','duyenduong',1,'00000000-0000-4000-8000-000000012021')->>'revision','2','unchanged owned handle allows second rename');
select is(pg_temp.observe()->'account'->>'displayName','Duyên Dương II','multiple transitions verified');
select throws_ok($$select pg_temp.profile_update('Third','duyenduong',2,gen_random_uuid())$$,'PT429','Display name can be changed twice every 7 days','display name quota retained');
select throws_ok($$update private.employee_profile_renames set after_name='Tamper'$$,'42501','Employee profile provenance is append only','provenance append only');
select is((select to_jsonb(a) from auth.users a where id='00000000-0000-4000-8000-000000012002'),(select auth from immutable_before),'Auth identity credentials metadata ban preserved');
select is((select jsonb_agg(to_jsonb(a)) from auth.identities a where user_id='00000000-0000-4000-8000-000000012002'),(select identities from immutable_before),'provider identities preserved');
select is((select jsonb_agg(to_jsonb(a)) from public.workspace_members a where user_id='00000000-0000-4000-8000-000000012002'),(select memberships from immutable_before),'memberships preserved');
select is((select to_jsonb(a) from public.platform_user_roles a where user_id='00000000-0000-4000-8000-000000012002'),(select grants from immutable_before),'grants preserved');
select is((select to_jsonb(a) from private.employee_creation_intents a where user_id='00000000-0000-4000-8000-000000012002'),(select intent from immutable_before),'CREATE intent unchanged');
select is((select to_jsonb(a) from private.employee_creation_operations a where target_id='00000000-0000-4000-8000-000000012002'),(select operation from immutable_before),'CREATE operation unchanged');
select is((select jsonb_agg(to_jsonb(a)) from private.employee_creation_operation_history a),(select history from immutable_before),'CREATE history unchanged');
select is((select to_jsonb(m)-'display_name'-'sender_name'-'updated_at' from private.mail_mailboxes m join private.infrastructure_employees e on e.mailbox_id=m.id where e.user_id='00000000-0000-4000-8000-000000012002'),(select mailbox from immutable_before),'mailbox UUID address and ownership preserved');
update private.mail_mailboxes set sender_name='Drift' where id=(select mailbox_id from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000012002');
select is(pg_temp.observe()->'account','null'::jsonb,'mailbox drift rejects lineage observation');
update private.mail_mailboxes set sender_name='Duyên Dương II' where id=(select mailbox_id from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000012002');
update private.employee_creation_operations set phase='unknown' where target_id='00000000-0000-4000-8000-000000012002';
select is(pg_temp.observe()->'account','null'::jsonb,'unknown CREATE cannot borrow rename proof');
update private.employee_creation_operations set phase='active' where target_id='00000000-0000-4000-8000-000000012002';
select private.begin_employee_restore('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com',2,'00000000-0000-4000-8000-000000012030');
select throws_ok($$select pg_temp.profile_update('Duyên Dương II','duyenduong',2,gen_random_uuid())$$,'23514','Employee profile preimage conflict','unresolved RESTORE denies rename');
select private.mark_employee_restore_attempt('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com',2,'00000000-0000-4000-8000-000000012030');
select is(private.confirm_employee_restore('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com',2,'00000000-0000-4000-8000-000000012030')->>'revision','3','new RESTORE uses renamed revision');
select is(pg_temp.observe()->'account'->>'displayName','Duyên Dương II','completed RESTORE revision tolerated in lineage');
select is(pg_temp.profile_update('Duyên Dương II','duyenduong',3,'00000000-0000-4000-8000-000000012022')->>'revision','4','post-RESTORE profile revision advances');
select throws_ok($$select private.confirm_employee_restore('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com',2,'00000000-0000-4000-8000-000000012030')$$,'23514','Employee completed receipt stale','old RESTORE receipt stays stale');
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000012002' and field='handle';
select is(pg_temp.profile_update('Duyên Dương II','duyenretained',4,'00000000-0000-4000-8000-000000012023')->>'revision','5','new handle after normal cooldown');
select is((select creator_id from public.handles where value='duyenduong'),'00000000-0000-4000-8000-000000012002'::uuid,'previous owned handle retained');
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id='00000000-0000-4000-8000-000000012002' and field='handle';
select is(pg_temp.profile_update('Duyên Dương II',null,5,'00000000-0000-4000-8000-000000012024')->>'revision','6','clear handle follows normal cooldown');
select is((select creator_id from public.handles where value='duyenretained'),'00000000-0000-4000-8000-000000012002'::uuid,'cleared owned handle remains reserved');
delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000012001';
select throws_ok($$select pg_temp.profile_update('Duyên Dương II',null,6,gen_random_uuid())$$,'42501','Employee administrator access denied','fresh membership revocation denied');
select ok(not private.employee_profile_lineage('00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com','Duyên Dương II',7,'00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012010'),'missing revision provenance rejected');
select ok(not private.employee_profile_lineage('00000000-0000-4000-8000-000000012002','foreign@tuturuuu.com','Duyên Dương II',6,'00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012010'),'foreign email lineage rejected');
select ok(not private.employee_profile_lineage('00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com','Duyên Dương II',6,'00000000-0000-4000-8000-000000012003','00000000-0000-4000-8000-000000012010'),'foreign CREATE actor lineage rejected');
select ok(not private.employee_profile_lineage('00000000-0000-4000-8000-000000012002','profile-target@tuturuuu.com','Forged Name',6,'00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012010'),'broken name chain rejected');
select * from finish();
rollback;
