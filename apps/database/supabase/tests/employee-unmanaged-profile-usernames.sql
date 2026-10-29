begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000014001','legacy-admin@tuturuuu.com',now(),null,'{}','{}'),
('00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com',null,now()+interval '100 years','{}','{}'),
('00000000-0000-4000-8000-000000014003','legacy-ordinary@tuturuuu.com',now(),null,'{}','{}'),
('00000000-0000-4000-8000-000000014004','legacy-foreign@example.test',now(),null,'{}','{}'),
('00000000-0000-4000-8000-000000014005','legacy-other@tuturuuu.com',now(),null,'{}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Legacy profile fixture','00000000-0000-4000-8000-000000014001',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000014001','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
update public.users set display_name='Legacy Original' where id='00000000-0000-4000-8000-000000014002';
update public.users set display_name=null where id='00000000-0000-4000-8000-000000014005';
update private.user_profile_change_events set changed_at=now()-interval '30 days'
where user_id in('00000000-0000-4000-8000-000000014002','00000000-0000-4000-8000-000000014005');
select private.employee_creation_preflight('00000000-0000-4000-8000-000000014001',
'00000000-0000-4000-8000-000000014007','legacy-managed@tuturuuu.com','Managed Original');
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000014007','legacy-managed@tuturuuu.com',now(),now()+interval '100 years','{"employee_onboarding":true}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
select private.finalize_employee_creation('00000000-0000-4000-8000-000000014001',
'00000000-0000-4000-8000-000000014007','legacy-managed@tuturuuu.com','Managed Original');
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000014007';
select private.confirm_employee_activation('00000000-0000-4000-8000-000000014001',
'00000000-0000-4000-8000-000000014007','legacy-managed@tuturuuu.com');
create temporary table legacy_managed_before as select
(select to_jsonb(e) from private.infrastructure_employees e where user_id='00000000-0000-4000-8000-000000014007') registry,
(select to_jsonb(u) from public.users u where id='00000000-0000-4000-8000-000000014007') profile,
(select to_jsonb(m) from private.mail_mailboxes m join private.infrastructure_employees e on e.mailbox_id=m.id where e.user_id='00000000-0000-4000-8000-000000014007') mailbox;
create function pg_temp.legacy_update(p_name text,p_handle text,p_expected_name text default 'Legacy Original',
p_expected_handle text default null,p_operation uuid default '00000000-0000-4000-8000-000000014020')
returns jsonb language sql as $$
select private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014001',
'00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com',p_operation,p_expected_name,p_expected_handle,p_name,p_handle);
$$;
create function pg_temp.legacy_observe(p_operation uuid default '00000000-0000-4000-8000-000000014020')
returns jsonb language sql as $$
select private.inspect_unmanaged_internal_profile_operation('00000000-0000-4000-8000-000000014001',
'00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com',p_operation);
$$;
-- The exception block rolls the supplied evidence back along with the refused
-- action. A setup failure has a different message and cannot satisfy the test.
create function pg_temp.evidence_denial(p_setup text,p_inspect boolean default false)
returns text language plpgsql as $$
begin
  execute p_setup;
  if p_inspect then perform pg_temp.legacy_observe();
  else perform pg_temp.legacy_update('Legacy Renamed','legacyshort'); end if;
  return 'ALLOWED';
exception when others then return sqlstate||':'||sqlerrm;
end;
$$;
create temporary table legacy_immutable as select
(select to_jsonb(a) from auth.users a where id='00000000-0000-4000-8000-000000014002') auth,
(select to_jsonb(d) from public.user_private_details d where user_id='00000000-0000-4000-8000-000000014002') details,
(select jsonb_agg(to_jsonb(m) order by ws_id) from public.workspace_members m where user_id='00000000-0000-4000-8000-000000014002') memberships,
(select to_jsonb(r) from public.platform_user_roles r where user_id='00000000-0000-4000-8000-000000014002') grants,
(select jsonb_agg(to_jsonb(m) order by id) from private.mail_mailboxes m where created_by='00000000-0000-4000-8000-000000014002') mailboxes;
select ok(not has_function_privilege('anon','private.update_unmanaged_internal_profile(uuid,uuid,text,uuid,text,text,text,text)','EXECUTE'),'anon cannot write');
select ok(not has_function_privilege('authenticated','private.update_unmanaged_internal_profile(uuid,uuid,text,uuid,text,text,text,text)','EXECUTE'),'ordinary role cannot write');
select ok(not has_function_privilege('authenticated','private.inspect_unmanaged_internal_profile_operation(uuid,uuid,text,uuid)','EXECUTE'),'ordinary role cannot inspect receipts');
select ok(has_function_privilege('service_role','private.update_unmanaged_internal_profile(uuid,uuid,text,uuid,text,text,text,text)','EXECUTE'),'service may enter guarded writer');
select ok(not has_function_privilege('service_role','private.lock_unmanaged_internal_profile(uuid,uuid,text)','EXECUTE'),'bare service cannot invoke private admission helper');
select ok(not has_function_privilege('service_role','private.unmanaged_internal_profile_receipt(private.unmanaged_internal_profile_operations)','EXECUTE'),'bare service cannot serialize arbitrary receipts');
select ok(not has_table_privilege('service_role','private.unmanaged_internal_profile_operations','INSERT'),'service cannot forge receipts');
select ok(not has_table_privilege('service_role','private.employee_profile_write_context','INSERT'),'service cannot mint context');
select is(pg_temp.legacy_observe()->'receipt','null'::jsonb,'independent inspection finds no unperformed operation');
select is(pg_temp.legacy_observe()->'current'->>'displayName','Legacy Original','current preimage read independently');
select throws_ok($$select private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014003','00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com',gen_random_uuid(),'Legacy Original',null,'Legacy Renamed','legacyshort')$$,'42501','Employee administrator access denied','ordinary actor denied');
select throws_ok($$select private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014002','wrong@tuturuuu.com',gen_random_uuid(),'Legacy Original',null,'Legacy Renamed','legacyshort')$$,'23514','Unmanaged internal profile identity conflict','wrong tuple email denied');
select throws_ok($$select private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014004','legacy-foreign@example.test',gen_random_uuid(),'Legacy Original',null,'Legacy Renamed','legacyshort')$$,'23514','Unmanaged internal profile identity conflict','wrong target domain denied');
select throws_ok($$select private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014002','LEGACY-TARGET@tuturuuu.com',gen_random_uuid(),'Legacy Original',null,'Legacy Renamed','legacyshort')$$,'23514','Unmanaged internal profile identity conflict','noncanonical email denied');
select is(pg_temp.evidence_denial($$delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000014001'$$),'42501:Employee administrator access denied','revoked administrator refused freshly');
select is(pg_temp.evidence_denial($$delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000014001'$$,true),'42501:Employee administrator access denied','revoked administrator cannot inspect');
select is(pg_temp.evidence_denial($$update auth.users set banned_until=now()+interval '1 year' where id='00000000-0000-4000-8000-000000014001'$$),'42501:Employee administrator access denied','disabled actor refused freshly');
select is(pg_temp.evidence_denial($$update auth.users set raw_app_meta_data='{"employee_onboarding":true}' where id='00000000-0000-4000-8000-000000014002'$$),'23514:Managed account requires employee profile protocol','onboarding-only cannot use legacy writer');
select is(pg_temp.evidence_denial($$update auth.users set raw_app_meta_data='{"employee_onboarding":true}' where id='00000000-0000-4000-8000-000000014002'$$,true),'23514:Managed account requires employee profile protocol','onboarding-only cannot use legacy inspector');
select is(pg_temp.evidence_denial($$update auth.users set raw_app_meta_data='{"employee_onboarding":false}' where id='00000000-0000-4000-8000-000000014002'$$),'23514:Managed account requires employee profile protocol','partial onboarding marker cannot use legacy writer');
select is(pg_temp.evidence_denial($$update auth.users set raw_app_meta_data='{"employee_onboarding":false}' where id='00000000-0000-4000-8000-000000014002'$$,true),'23514:Managed account requires employee profile protocol','partial onboarding marker cannot use legacy inspector');
select is(pg_temp.evidence_denial($$insert into private.infrastructure_employees(user_id,staff_email,managed_name) values('00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com','Legacy Original')$$),'23514:Managed account requires employee profile protocol','registry-only cannot use legacy writer');
select is(pg_temp.evidence_denial($$insert into private.infrastructure_employees(user_id,staff_email,managed_name) values('00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com','Legacy Original')$$,true),'23514:Managed account requires employee profile protocol','registry-only cannot use legacy inspector');
select is(pg_temp.evidence_denial($$insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values('00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com','Legacy Original','00000000-0000-4000-8000-000000014001')$$),'23514:Managed account requires employee profile protocol','intent-only cannot use legacy writer');
select is(pg_temp.evidence_denial($$insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values('00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com','Legacy Original','00000000-0000-4000-8000-000000014001')$$,true),'23514:Managed account requires employee profile protocol','intent-only cannot use legacy inspector');
select is(pg_temp.evidence_denial($$insert into private.employee_creation_operations(actor_id,operation_id,target_id,staff_email,managed_name,phase) values('00000000-0000-4000-8000-000000014001',gen_random_uuid(),'00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com','Legacy Original','unknown')$$),'23514:Managed account requires employee profile protocol','CREATE journal-only cannot use legacy writer');
select is(pg_temp.evidence_denial($$insert into private.employee_creation_operations(actor_id,operation_id,target_id,staff_email,managed_name,phase) values('00000000-0000-4000-8000-000000014001',gen_random_uuid(),'00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com','Legacy Original','unknown')$$,true),'23514:Managed account requires employee profile protocol','CREATE journal-only cannot use legacy inspector');
select is(pg_temp.evidence_denial($$insert into private.employee_restore_operations(operation_id,user_id,staff_email,expected_revision,actor_id,phase) values(gen_random_uuid(),'00000000-0000-4000-8000-000000014007','legacy-target@tuturuuu.com',0,'00000000-0000-4000-8000-000000014001','completed')$$),'23514:Managed account requires employee profile protocol','completed RESTORE email evidence cannot use legacy writer');
select is(pg_temp.evidence_denial($$insert into private.employee_restore_operations(operation_id,user_id,staff_email,expected_revision,actor_id,phase) values(gen_random_uuid(),'00000000-0000-4000-8000-000000014007','legacy-target@tuturuuu.com',0,'00000000-0000-4000-8000-000000014001','completed')$$,true),'23514:Managed account requires employee profile protocol','completed RESTORE email evidence cannot use legacy inspector');
select is(pg_temp.evidence_denial($$insert into private.employee_address_migrations(operation_id,user_id,source_address,destination_address,binding,phase,attempt_id,original_state) values('00000000-0000-4000-8000-000000014080','00000000-0000-4000-8000-000000014005','legacy-target@tuturuuu.com','legacy-next@tuturuuu.com','{"operationId":"00000000-0000-4000-8000-000000014080","userId":"00000000-0000-4000-8000-000000014005","sourceAddress":"legacy-target@tuturuuu.com","destinationAddress":"legacy-next@tuturuuu.com"}','reserved',null,'{}')$$),'23514:Managed account requires employee profile protocol','reserved address evidence cannot use legacy writer');
select is(pg_temp.evidence_denial($$insert into private.employee_address_migrations(operation_id,user_id,source_address,destination_address,binding,phase,attempt_id,original_state) values('00000000-0000-4000-8000-000000014080','00000000-0000-4000-8000-000000014005','legacy-target@tuturuuu.com','legacy-next@tuturuuu.com','{"operationId":"00000000-0000-4000-8000-000000014080","userId":"00000000-0000-4000-8000-000000014005","sourceAddress":"legacy-target@tuturuuu.com","destinationAddress":"legacy-next@tuturuuu.com"}','reserved',null,'{}')$$,true),'23514:Managed account requires employee profile protocol','reserved address evidence cannot use legacy inspector');
select is(pg_temp.evidence_denial($$insert into private.employee_address_migrations(operation_id,user_id,source_address,destination_address,binding,phase,attempt_id,original_state) values('00000000-0000-4000-8000-000000014080','00000000-0000-4000-8000-000000014005','legacy-target@tuturuuu.com','legacy-next@tuturuuu.com','{"operationId":"00000000-0000-4000-8000-000000014080","userId":"00000000-0000-4000-8000-000000014005","sourceAddress":"legacy-target@tuturuuu.com","destinationAddress":"legacy-next@tuturuuu.com"}','completed',gen_random_uuid(),'{}')$$),'23514:Managed account requires employee profile protocol','completed address evidence cannot use legacy writer');
select is(pg_temp.evidence_denial($$insert into private.employee_address_migrations(operation_id,user_id,source_address,destination_address,binding,phase,attempt_id,original_state) values('00000000-0000-4000-8000-000000014080','00000000-0000-4000-8000-000000014005','legacy-target@tuturuuu.com','legacy-next@tuturuuu.com','{"operationId":"00000000-0000-4000-8000-000000014080","userId":"00000000-0000-4000-8000-000000014005","sourceAddress":"legacy-target@tuturuuu.com","destinationAddress":"legacy-next@tuturuuu.com"}','completed',gen_random_uuid(),'{}')$$,true),'23514:Managed account requires employee profile protocol','completed address evidence cannot use legacy inspector');
select throws_ok($$select private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014007','legacy-managed@tuturuuu.com',gen_random_uuid(),null,null,'Loose Rename','legacyshort')$$,'23514','Managed account requires employee profile protocol','managed target cannot bypass employee name protocol');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','')$$,'22023','Invalid username','invalid or reserved handle  denied');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','_legacy')$$,'22023','Invalid username','invalid or reserved handle _legacy denied');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','Legacy')$$,'22023','Invalid username','invalid or reserved handle Legacy denied');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','le-gacy')$$,'22023','Invalid username','invalid or reserved handle le-gacy denied');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','admin')$$,'22023','Invalid username','invalid or reserved handle admin denied');
insert into public.handles(value,creator_id) values('dupe','00000000-0000-4000-8000-000000014005'),('none',null),(repeat('f',65),'00000000-0000-4000-8000-000000014005');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','dupe')$$,'23505','Username is unavailable','foreign short owner denied');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','none')$$,'23505','Username is unavailable','NULL owner denied');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed',repeat('f',65))$$,'23505','Username is unavailable','foreign long owner denied');
select is((select count(*) from private.unmanaged_internal_profile_operations where user_id='00000000-0000-4000-8000-000000014002'),0::bigint,'refused operations leave no receipt');
select is((select count(*) from private.employee_profile_write_context where user_id='00000000-0000-4000-8000-000000014002'),0::bigint,'refused operations leave no context');
set local role service_role;
select is(private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014002','legacy-target@tuturuuu.com','00000000-0000-4000-8000-000000014020','Legacy Original',null,'Legacy Renamed','v')->>'username','v','service transport writes 1 char for disabled unconfirmed legacy target');
reset role;
select is(pg_temp.legacy_observe()->'receipt',jsonb_build_object('operationId','00000000-0000-4000-8000-000000014020','actorUserId','00000000-0000-4000-8000-000000014001','id','00000000-0000-4000-8000-000000014002','email','legacy-target@tuturuuu.com','expectedDisplayName','Legacy Original','expectedUsername',null,'displayName','Legacy Renamed','username','v'),'independent receipt has exact fixed contract');
select is(pg_temp.legacy_observe()->'current',jsonb_build_object('managed',false,'id','00000000-0000-4000-8000-000000014002','email','legacy-target@tuturuuu.com','displayName','Legacy Renamed','username','v'),'independent committed-current shape agrees');
select is(pg_temp.legacy_update('Legacy Renamed','v'),pg_temp.legacy_observe()->'receipt','exact replay returns receipt without another mutation');
select is((select count(*) from private.unmanaged_internal_profile_operations where user_id='00000000-0000-4000-8000-000000014002'),1::bigint,'replay appends no receipt');
select is((select count(*) from private.user_profile_change_events where user_id='00000000-0000-4000-8000-000000014002' and field='handle'),1::bigint,'replay appends no quota event');
select throws_ok($$select pg_temp.legacy_update('Other','v')$$,'23505','Internal profile operation payload conflict','same operation binds new name');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','hehe')$$,'23505','Internal profile operation payload conflict','same operation binds new handle');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','v','Wrong')$$,'23505','Internal profile operation payload conflict','same operation binds expected name');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','v','Legacy Original','wrong')$$,'23505','Internal profile operation payload conflict','same operation binds expected handle');
select throws_ok($$select private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014005','legacy-other@tuturuuu.com','00000000-0000-4000-8000-000000014020',null,null,'Other','v')$$,'23505','Internal profile operation payload conflict','operation cannot cross target tuple');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','v','Legacy Original',null,gen_random_uuid())$$,'23514','Internal profile preimage conflict','new operation cannot reuse stale name preimage');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','v','Legacy Renamed','wrong',gen_random_uuid())$$,'23514','Internal profile preimage conflict','new operation cannot reuse stale handle preimage');
select throws_ok($$select pg_temp.legacy_update('Legacy Renamed','hehe','Legacy Renamed','v',gen_random_uuid())$$,'PT429','Username can be changed every 14 days','legacy administrator cooldown retained');
select is((select count(*) from public.handles where value='hehe'),0::bigint,'quota failure rolls reservation back');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000014002'),'v','quota failure preserves previous handle');
update private.user_profile_change_events set changed_at=now()-interval '30 days' where user_id='00000000-0000-4000-8000-000000014002' and field='handle';
select is(pg_temp.legacy_update('Legacy Renamed','hehe','Legacy Renamed','v','00000000-0000-4000-8000-000000014021')->>'username','hehe','administrator stores changed handle case 2');
select is((select creator_id from public.handles where value='hehe'),'00000000-0000-4000-8000-000000014002'::uuid,'new reservation has exact target owner case 2');
select is((select count(*) from public.handles where value='v'),0::bigint,'legacy old reservation released atomically case 2');
update private.user_profile_change_events set changed_at=now()-interval '30 days' where user_id='00000000-0000-4000-8000-000000014002' and field='handle';
select is(pg_temp.legacy_update('Legacy Renamed',repeat('j',33),'Legacy Renamed','hehe','00000000-0000-4000-8000-000000014022')->>'username',repeat('j',33),'administrator stores changed handle case 3');
select is((select creator_id from public.handles where value=repeat('j',33)),'00000000-0000-4000-8000-000000014002'::uuid,'new reservation has exact target owner case 3');
select is((select count(*) from public.handles where value='hehe'),0::bigint,'legacy old reservation released atomically case 3');
update private.user_profile_change_events set changed_at=now()-interval '30 days' where user_id='00000000-0000-4000-8000-000000014002' and field='handle';
select is(pg_temp.legacy_update('Legacy Renamed',repeat('k',65),'Legacy Renamed',repeat('j',33),'00000000-0000-4000-8000-000000014023')->>'username',repeat('k',65),'administrator stores changed handle case 4');
select is((select creator_id from public.handles where value=repeat('k',65)),'00000000-0000-4000-8000-000000014002'::uuid,'new reservation has exact target owner case 4');
select is((select count(*) from public.handles where value=repeat('j',33)),0::bigint,'legacy old reservation released atomically case 4');
update private.user_profile_change_events set changed_at=now()-interval '30 days' where user_id='00000000-0000-4000-8000-000000014002' and field='handle';
select is(pg_temp.legacy_update('Legacy Renamed',repeat('l',81),'Legacy Renamed',repeat('k',65),'00000000-0000-4000-8000-000000014024')->>'username',repeat('l',81),'administrator stores changed handle case 5');
select is((select creator_id from public.handles where value=repeat('l',81)),'00000000-0000-4000-8000-000000014002'::uuid,'new reservation has exact target owner case 5');
select is((select count(*) from public.handles where value=repeat('k',65)),0::bigint,'legacy old reservation released atomically case 5');
update private.user_profile_change_events set changed_at=now()-interval '30 days' where user_id='00000000-0000-4000-8000-000000014002' and field='handle';
select is(pg_temp.legacy_update('Legacy Renamed',repeat('m',1001),'Legacy Renamed',repeat('l',81),'00000000-0000-4000-8000-000000014025')->>'username',repeat('m',1001),'administrator stores changed handle case 6');
select is((select creator_id from public.handles where value=repeat('m',1001)),'00000000-0000-4000-8000-000000014002'::uuid,'new reservation has exact target owner case 6');
select is((select count(*) from public.handles where value=repeat('l',81)),0::bigint,'legacy old reservation released atomically case 6');
update private.user_profile_change_events set changed_at=now()-interval '30 days' where user_id='00000000-0000-4000-8000-000000014002' and field='handle';
select is(pg_temp.legacy_update('Legacy Renamed',null,'Legacy Renamed',repeat('m',1001),'00000000-0000-4000-8000-000000014026')->'username','null'::jsonb,'null clears long handle');
select is((select count(*) from public.handles where value=repeat('m',1001)),0::bigint,'null clear releases previous owned long handle');
select is((select count(*) from private.unmanaged_internal_profile_operations where user_id='00000000-0000-4000-8000-000000014002'),7::bigint,'seven changes have seven receipts');
select is((select count(*) from private.employee_profile_write_context where user_id='00000000-0000-4000-8000-000000014002'),0::bigint,'successful writes leave no context');
select is(pg_temp.legacy_update('Legacy Twice',null,'Legacy Renamed',null,'00000000-0000-4000-8000-000000014027')->>'displayName','Legacy Twice','second display-name change admitted');
select throws_ok($$select pg_temp.legacy_update('Legacy Third',null,'Legacy Twice',null,gen_random_uuid())$$,'PT429','Display name can be changed twice every 7 days','display-name rate limit retained');
select is(private.inspect_unmanaged_internal_profile_operation('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014005','legacy-other@tuturuuu.com','00000000-0000-4000-8000-000000014020')->'receipt','null'::jsonb,'independent inspector never borrows another target receipt');
select is(private.update_unmanaged_internal_profile('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014005','legacy-other@tuturuuu.com',gen_random_uuid(),null,null,'Nullable Preimage',null)->'expectedDisplayName','null'::jsonb,'nullable name and handle CAS preimage accepted');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000014003',jsonb_build_object('handle','v'))$$,'22023','Invalid username','public self service still rejects 1 char');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000014003',jsonb_build_object('handle','hehe'))$$,'22023','Invalid username','public self service still rejects 4 chars');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000014003',jsonb_build_object('handle',repeat('j',33)))$$,'22023','Invalid username','public self service still rejects 33 chars');
select throws_ok($$update public.users set handle='hehe' where id='00000000-0000-4000-8000-000000014002'$$,'22023','Invalid or reserved username','bare update gets no legacy exception');
select throws_ok($$insert into public.handles(value,creator_id) values(repeat('z',1001),'00000000-0000-4000-8000-000000014002')$$,'22001',null,'bare reservation keeps generic length cap');
select throws_ok($$update private.unmanaged_internal_profile_operations set after_name='Tamper' where user_id='00000000-0000-4000-8000-000000014002'$$,'42501','Employee profile provenance is append only','receipt updates denied');
select throws_ok($$delete from private.unmanaged_internal_profile_operations where user_id='00000000-0000-4000-8000-000000014002'$$,'42501','Employee profile provenance is append only','receipt deletes denied');
select is((select to_jsonb(a) from auth.users a where id='00000000-0000-4000-8000-000000014002'),(select auth from legacy_immutable),'Auth identity metadata confirmation and ban preserved');
select is((select to_jsonb(d) from public.user_private_details d where user_id='00000000-0000-4000-8000-000000014002'),(select details from legacy_immutable),'legacy private details remain unchanged');
select is((select jsonb_agg(to_jsonb(m) order by ws_id) from public.workspace_members m where user_id='00000000-0000-4000-8000-000000014002'),(select memberships from legacy_immutable),'memberships preserved');
select is((select to_jsonb(r) from public.platform_user_roles r where user_id='00000000-0000-4000-8000-000000014002'),(select grants from legacy_immutable),'grants preserved');
select is((select jsonb_agg(to_jsonb(m) order by id) from private.mail_mailboxes m where created_by='00000000-0000-4000-8000-000000014002'),(select mailboxes from legacy_immutable),'mailboxes preserved');
select is((select count(*) from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000014002'),0::bigint,'legacy update creates no managed registry');
select is((select count(*) from private.employee_profile_renames where user_id='00000000-0000-4000-8000-000000014002'),0::bigint,'legacy update borrows no managed lineage');
select is((select to_jsonb(e) from private.infrastructure_employees e where user_id='00000000-0000-4000-8000-000000014007'),(select registry from legacy_managed_before),'managed registry remains unchanged');
select is((select to_jsonb(u) from public.users u where id='00000000-0000-4000-8000-000000014007'),(select profile from legacy_managed_before),'managed profile remains unchanged');
select is((select to_jsonb(m) from private.mail_mailboxes m join private.infrastructure_employees e on e.mailbox_id=m.id where e.user_id='00000000-0000-4000-8000-000000014007'),(select mailbox from legacy_managed_before),'managed mailbox remains unchanged');
select * from finish();
rollback;
