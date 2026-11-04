begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000009710','adjudication-admin@tuturuuu.com',now(),'{}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
insert into public.workspaces(id,name,creator_id,personal)
values('00000000-0000-0000-0000-000000000000','Adjudication fixture','00000000-0000-4000-8000-000000009710',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type)
values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009710','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
select private.employee_creation_operation_claim('00000000-0000-4000-8000-000000009710',
  '00000000-0000-4000-8000-000000009720','adjudication-new@tuturuuu.com','Adjudication Employee');
create function pg_temp.step(p_version integer,p_event uuid,p_phase text) returns jsonb language sql as $$
  select private.employee_creation_operation_advance(actor_id,operation_id,lease_id,p_version,p_event,p_phase,null)
  from private.employee_creation_operations where operation_id='00000000-0000-4000-8000-000000009720';
$$;
select pg_temp.step(0,'00000000-0000-4000-8000-000000009730','auth_attempted');
select pg_temp.step(1,'00000000-0000-4000-8000-000000009731','unknown');
create temporary table original as select * from private.employee_creation_operations
where operation_id='00000000-0000-4000-8000-000000009720';
create function pg_temp.adjudicate(p_attestation jsonb default
  '{"kind":"administrator-adjudication-v1","terminalAuthRejection":true,"noRequestInFlight":true,"absenceIsNotRejectionProof":true,"acceptResponsibility":true}')
returns jsonb language sql as $$
  select private.adjudicate_employee_creation_rejection(actor_id,actor_id,operation_id,target_id,staff_email,
    managed_name,2,lease_id,'00000000-0000-4000-8000-000000009730',
    '00000000-0000-4000-8000-000000009732',repeat('a',64),
    'administrator_adjudicated_terminal_auth_rejection',p_attestation) from original;
$$;
select ok(not has_function_privilege('anon','private.adjudicate_employee_creation_rejection(uuid,uuid,uuid,uuid,text,text,integer,uuid,uuid,uuid,text,text,jsonb)','EXECUTE'),'anon denied');
select ok(not has_function_privilege('authenticated','private.adjudicate_employee_creation_rejection(uuid,uuid,uuid,uuid,text,text,integer,uuid,uuid,uuid,text,text,jsonb)','EXECUTE'),'authenticated denied');
select ok(not has_table_privilege('service_role','private.employee_creation_rejection_adjudications','INSERT'),'service cannot forge audit');
select throws_ok($$select pg_temp.adjudicate()$$,'23514','Employee rejection recovery state denied','live lease denied');
update private.employee_creation_operations set lease_expires_at=clock_timestamp()-interval '1 second'
where operation_id='00000000-0000-4000-8000-000000009720';
select is(private.inspect_employee_creation_rejection('00000000-0000-4000-8000-000000009710','00000000-0000-4000-8000-000000009720')->>'status','eligible','readback exposes only expired original unknown candidate');
select ok(not has_function_privilege('authenticated','private.inspect_employee_creation_rejection(uuid,uuid)','EXECUTE'),'authenticated cannot directly inspect service recovery');
select throws_ok($$select pg_temp.adjudicate('{}')$$,'23514','Employee rejection attestation required','absence alone cannot adjudicate');
update private.employee_creation_operations set revoked_at=clock_timestamp()
where operation_id='00000000-0000-4000-8000-000000009720';
select throws_ok($$select pg_temp.adjudicate()$$,'23514','Employee rejection recovery state denied','revoked denied');
update private.employee_creation_operations set revoked_at=null
where operation_id='00000000-0000-4000-8000-000000009720';
update private.employee_creation_intents set managed_name='Changed' where staff_email='adjudication-new@tuturuuu.com';
select throws_ok($$select pg_temp.adjudicate()$$,'23514','Employee rejection reservation denied','intent mismatch denied');
update private.employee_creation_intents set managed_name='Adjudication Employee' where staff_email='adjudication-new@tuturuuu.com';
insert into public.platform_email_roles(email,enabled) values('adjudication-new@tuturuuu.com',false);
select throws_ok($$select pg_temp.adjudicate()$$,'23514','Employee rejection absence guard denied','reserved grants denied');
delete from public.platform_email_roles where email='adjudication-new@tuturuuu.com';
select is(pg_temp.adjudicate()->>'kind','adjudicated','explicit adjudication succeeds');
select is(private.inspect_employee_creation_rejection('00000000-0000-4000-8000-000000009710','00000000-0000-4000-8000-000000009720')->>'status','retry_ready','committed audit permits explicit retry');
select is(private.inspect_employee_creation_rejection('00000000-0000-4000-8000-000000009710','00000000-0000-4000-8000-000000009720')->>'eventId','00000000-0000-4000-8000-000000009732','readback binds audit event');
select is((select phase from private.employee_creation_operations where operation_id=(select operation_id from original)),'reserved','only reservation restored');
select is((select version from private.employee_creation_operations where operation_id=(select operation_id from original)),3,'version increases');
select ok((select employee_creation_operations.lease_id<>original.lease_id and employee_creation_operations.lease_expires_at<clock_timestamp() from private.employee_creation_operations cross join original where employee_creation_operations.operation_id=original.operation_id),'old lease fenced and new fence expired');
select is((select count(*) from private.employee_creation_operation_history where operation_id=(select operation_id from original)),3::bigint,'history preserved and appended');
select is((select count(*) from private.employee_creation_rejection_adjudications),1::bigint,'durable adjudication');
select is((select user_id from private.employee_creation_intents where staff_email='adjudication-new@tuturuuu.com'),(select target_id from original),'original intent retained');
select throws_ok($$select pg_temp.adjudicate()$$,'23514','Employee rejection recovery state denied','repair cannot replay');
select is(private.employee_creation_operation_claim('00000000-0000-4000-8000-000000009710',
  '00000000-0000-4000-8000-000000009720','adjudication-new@tuturuuu.com','Adjudication Employee')->>'kind','claimed','normal explicit create may claim');
select is(private.inspect_employee_creation_rejection('00000000-0000-4000-8000-000000009710','00000000-0000-4000-8000-000000009720')->>'status','fenced','claimed live lease cannot reopen editing');
select ok(not exists(select 1 from auth.users where id=(select target_id from original)),'repair never creates Auth');
select * from finish();
rollback;
