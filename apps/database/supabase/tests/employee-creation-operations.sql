-- Unapplied rollback-only pgTAP draft. No production SQL/provider writes.
-- CAS contenders below exercise the same stale lease/version race deterministically.
-- Root still must run two simultaneous sessions to qualify advisory/row locking.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000008810','journal-admin@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000008811','journal-outsider@example.com',now(),'{}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
insert into public.workspaces(id,name,creator_id,personal)
values('00000000-0000-0000-0000-000000000000','Root journal fixture','00000000-0000-4000-8000-000000008810',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type)
values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000008810','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';

select ok((select relrowsecurity from pg_class where oid='private.employee_creation_operations'::regclass),'operations RLS enabled');
select ok((select relrowsecurity from pg_class where oid='private.employee_creation_operation_history'::regclass),'history RLS enabled');
select ok(not has_table_privilege('anon','private.employee_creation_operations','INSERT'),'anon cannot write operations');
select ok(not has_table_privilege('authenticated','private.employee_creation_operations','UPDATE'),'authenticated cannot write operations');
select ok(not has_table_privilege('service_role','private.employee_creation_operations','INSERT'),'service cannot bypass RPC admission');
select ok(not has_table_privilege('service_role','private.employee_creation_operation_history','INSERT'),'service cannot forge history');
select ok(not has_function_privilege('authenticated','private.employee_creation_operation_claim(uuid,uuid,text,text)','EXECUTE'),'authenticated cannot claim');
select ok(not has_function_privilege('anon','private.employee_creation_operation_advance(uuid,uuid,uuid,integer,uuid,text,jsonb)','EXECUTE'),'anon cannot transition');
select ok(has_function_privilege('service_role','private.employee_creation_operation_claim(uuid,uuid,text,text)','EXECUTE'),'service can use claim RPC');
select ok(not exists(select 1 from information_schema.columns where table_schema='private'
  and table_name in ('employee_creation_operations','employee_creation_operation_history')
  and column_name ~ '(password|hash|verifier|secret|token)'),'no secret persistence columns');
select throws_ok($$select private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008811',
  '00000000-0000-4000-8000-000000008820','journal-denied@tuturuuu.com','Denied')$$,
  '42501','Employee administrator access denied','outsider cannot claim');
select ok(not exists(select 1 from private.employee_creation_operations where operation_id='00000000-0000-4000-8000-000000008820'),'denial leaves no operation');

create temporary table journal_first as select private.employee_creation_operation_claim(
  '00000000-0000-4000-8000-000000008810','00000000-0000-4000-8000-000000008821',
  'journal-new@tuturuuu.com','Journal Employee') value;
select is((select value->>'kind' from journal_first),'claimed','first claim owns execution');
select is(private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008821','journal-new@tuturuuu.com','Journal Employee')->>'kind','inspect','live concurrent claimant cannot execute');
select is(private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008821','journal-new@tuturuuu.com','Changed')->>'kind','payload_conflict','same key changed name conflicts');
select is(private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008821','journal-other@tuturuuu.com','Journal Employee')->>'kind','payload_conflict','same key changed email conflicts');
select is((select count(*) from private.employee_creation_intents where staff_email='journal-new@tuturuuu.com'),1::bigint,'one source-owned intent');
select is((select user_id::text from private.employee_creation_intents where staff_email='journal-new@tuturuuu.com'),
  (select value->'operation'->>'targetUserId' from journal_first),'journal target equals intent target');
select throws_ok($$select private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008822','journal-new@tuturuuu.com','Journal Employee')$$,
  '23505',null,'different key cannot reserve same identity');
select ok(not exists(select 1 from private.employee_creation_operations where operation_id='00000000-0000-4000-8000-000000008822'),'identity conflict rolls back operation');

create function pg_temp.journal_step(p_operation uuid,p_version integer,p_event uuid,p_next text,p_receipt jsonb default null)
returns jsonb language sql as $$
  select private.employee_creation_operation_advance(actor_id,operation_id,lease_id,p_version,p_event,p_next,p_receipt)
  from private.employee_creation_operations where operation_id=p_operation;
$$;
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008821',0,
  '00000000-0000-4000-8000-000000008830','auth_attempted')->>'kind','advanced','attempt mark commits before effect');
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008821',0,
  '00000000-0000-4000-8000-000000008831','auth_attempted')->>'kind','inspect','stale competing CAS cannot win');
select is((select count(*) from private.employee_creation_operation_history where operation_id='00000000-0000-4000-8000-000000008821'),1::bigint,'one CAS winner one history row');
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008821',0,
  '00000000-0000-4000-8000-000000008830','auth_attempted')->>'kind','inspect','exact event replay is idempotent');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008821',0,
  '00000000-0000-4000-8000-000000008830','unknown')$$,'23514','Employee event payload conflict','event id cannot be rebound');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008821',1,
  '00000000-0000-4000-8000-000000008832','active')$$,'23514','Employee transition denied','cannot skip confirmations');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008821',1,
  '00000000-0000-4000-8000-000000008832','auth_confirmed')$$,'23514','Employee receipt required','confirmation requires receipt');
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008821',1,
  '00000000-0000-4000-8000-000000008832','unknown')->>'kind','advanced','lost provider outcome recorded as unknown');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008821',2,
  '00000000-0000-4000-8000-000000008841','auth_attempted')$$,
  '23514','Employee transition denied','unknown cannot replay provider creation even with a live lease');
update private.employee_creation_operations set lease_expires_at=clock_timestamp()-interval '1 second'
where operation_id='00000000-0000-4000-8000-000000008821';
select is(private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008821','journal-new@tuturuuu.com','Journal Employee')->>'kind','inspect','expired unknown never acquires replacement execution');
select is((select target_id::text from private.employee_creation_operations where operation_id='00000000-0000-4000-8000-000000008821'),
  (select value->'operation'->>'targetUserId' from journal_first),'unknown retains original UUID');
select is((select count(*) from private.employee_creation_intents where staff_email='journal-new@tuturuuu.com'),1::bigint,'unknown retains intent');

-- A second synthetic operation exercises actual receipt/SQL outcome gates.
select private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008823','journal-receipt@tuturuuu.com','Receipt Employee');
select pg_temp.journal_step('00000000-0000-4000-8000-000000008823',0,
  '00000000-0000-4000-8000-000000008833','auth_attempted');
create function pg_temp.journal_receipt(p_operation uuid,p_active boolean,p_sql boolean)
returns jsonb language sql as $$
 select jsonb_build_object('targetUserId',target_id,'email',staff_email,
   'providerReceiptId','00000000-0000-4000-8000-000000008899',
   'authConfirmed',true,'authPending',not p_active,'providerActive',p_active,'sqlConfirmed',p_sql,
   'profilesConfirmed',p_sql,'mailboxConfirmed',p_sql,'grantsConfirmed',p_sql)
 from private.employee_creation_operations where operation_id=p_operation;
$$;
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008823',1,
  '00000000-0000-4000-8000-000000008834','auth_confirmed',
  pg_temp.journal_receipt('00000000-0000-4000-8000-000000008823',false,false)||'{"password":"never-store"}')$$,
  '23514','Employee receipt identity denied','secret/extra receipt fields denied');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008823',1,
  '00000000-0000-4000-8000-000000008834','auth_confirmed',
  pg_temp.journal_receipt('00000000-0000-4000-8000-000000008823',false,false)||'{"email":"other@tuturuuu.com"}')$$,
  '23514','Employee receipt identity denied','receipt cannot rebind email');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008823',1,
  '00000000-0000-4000-8000-000000008834','auth_confirmed',
  pg_temp.journal_receipt('00000000-0000-4000-8000-000000008823',false,false))$$,
  '23514','Employee Auth outcome not confirmed','fabricated flags cannot confirm absent Auth');
-- Test-only provider-state simulation, never a production Auth SQL instruction.
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data)
select target_id,staff_email,now(),now()+interval '100 years','{"employee_onboarding":true}',
  jsonb_build_object('display_name',managed_name,'full_name',managed_name)
from private.employee_creation_operations where operation_id='00000000-0000-4000-8000-000000008823';
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008823',1,
  '00000000-0000-4000-8000-000000008834','auth_confirmed',
  pg_temp.journal_receipt('00000000-0000-4000-8000-000000008823',false,false))->>'kind','advanced','exact pending Auth receipt accepted');
select pg_temp.journal_step('00000000-0000-4000-8000-000000008823',2,
  '00000000-0000-4000-8000-000000008835','finalize_attempted');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008823',3,
  '00000000-0000-4000-8000-000000008836','provisioned',
  pg_temp.journal_receipt('00000000-0000-4000-8000-000000008823',false,true))$$,
  '23514','Employee SQL outcome not confirmed','flags cannot confirm unprovisioned SQL');
select private.finalize_employee_creation(actor_id,target_id,staff_email,managed_name)
from private.employee_creation_operations where operation_id='00000000-0000-4000-8000-000000008823';
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008823',3,
  '00000000-0000-4000-8000-000000008836','provisioned',
  pg_temp.journal_receipt('00000000-0000-4000-8000-000000008823',false,true))->>'kind','advanced','actual SQL finalization receipt accepted');
select pg_temp.journal_step('00000000-0000-4000-8000-000000008823',4,
  '00000000-0000-4000-8000-000000008837','activation_attempted');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008823',5,
  '00000000-0000-4000-8000-000000008838','active',
  pg_temp.journal_receipt('00000000-0000-4000-8000-000000008823',true,true))$$,
  '23514','Employee Auth outcome not confirmed','banned provider identity cannot publish created');
update auth.users set banned_until=null where id=(select target_id from private.employee_creation_operations
  where operation_id='00000000-0000-4000-8000-000000008823');
select private.confirm_employee_activation(actor_id,target_id,staff_email)
from private.employee_creation_operations where operation_id='00000000-0000-4000-8000-000000008823';
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008823',5,
  '00000000-0000-4000-8000-000000008838','active',
  pg_temp.journal_receipt('00000000-0000-4000-8000-000000008823',true,true))->>'kind','advanced','all real SQL confirmations permit created');
select is((select count(*) from private.employee_creation_operation_history where operation_id='00000000-0000-4000-8000-000000008823'),6::bigint,'phase and history advance atomically');

-- Revocation, stale authority and expiry preserve selected target and known state.
select private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008824','journal-revoke@tuturuuu.com','Revoked Employee');
select private.employee_creation_operation_revoke('00000000-0000-4000-8000-000000008810','00000000-0000-4000-8000-000000008824');
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008824',0,
  '00000000-0000-4000-8000-000000008839','auth_attempted')->>'kind','inspect','revoked operation cannot dispatch');
update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-4000-8000-000000008810';
select throws_ok($$select private.employee_creation_operation_ready('00000000-0000-4000-8000-000000008810')$$,
  '42501','Employee administrator access denied','readiness repeats fresh ban check');
select throws_ok($$select pg_temp.journal_step('00000000-0000-4000-8000-000000008824',0,
  '00000000-0000-4000-8000-000000008839','auth_attempted')$$,
  '42501','Employee administrator access denied','transition repeats fresh authority');
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000008810';
select private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008825','journal-expire@tuturuuu.com','Expired Employee');
create temporary table journal_expired as select target_id,lease_id from private.employee_creation_operations
where operation_id='00000000-0000-4000-8000-000000008825';
update private.employee_creation_operations set lease_expires_at=clock_timestamp()-interval '1 second'
where operation_id='00000000-0000-4000-8000-000000008825';
select is(pg_temp.journal_step('00000000-0000-4000-8000-000000008825',0,
  '00000000-0000-4000-8000-000000008840','auth_attempted')->>'kind','inspect','expired lease cannot mark effect');
select is(private.employee_creation_operation_claim('00000000-0000-4000-8000-000000008810',
  '00000000-0000-4000-8000-000000008825','journal-expire@tuturuuu.com','Expired Employee')->>'kind','claimed','only never-attempted reservation can renew lease');
select ok((select op.target_id=old.target_id and op.lease_id<>old.lease_id from private.employee_creation_operations op,
  journal_expired old where op.operation_id='00000000-0000-4000-8000-000000008825'),'renewal keeps UUID and changes execution fence');
select is((select private.employee_creation_operation_advance(op.actor_id,op.operation_id,old.lease_id,0,
  '00000000-0000-4000-8000-000000008842','auth_attempted',null)->>'kind'
  from private.employee_creation_operations op,journal_expired old
  where op.operation_id='00000000-0000-4000-8000-000000008825'),'inspect','old claimant cannot dispatch after safe lease renewal');
select * from finish();
rollback;
