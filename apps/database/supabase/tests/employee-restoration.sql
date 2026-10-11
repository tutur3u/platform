-- AUTHORED, UNEXECUTED. Refrozen correction packet; no old executor registration.
-- Pair-order checks below are single-session constraints, not two-session proof.
-- Synthetic Auth writes below only simulate supported provider outcomes in this
-- separately admitted rollback-only test. Production RPCs never write Auth.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009940','restore-admin-fixture@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000009941','restore-legacy-fixture@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000009945','restore-foreign-fixture@example.test',now(),'{}','{}');
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Restore root fixture','00000000-0000-4000-8000-000000009940',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009940','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
-- Both argument orders exercise the same helper without conferring permission.
select lives_ok($$select private.lock_employee_auth_pair('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009941')$$,'sorted Auth pair accepts actor below target');
select lives_ok($$select private.lock_employee_auth_pair('00000000-0000-4000-8000-000000009941','00000000-0000-4000-8000-000000009940')$$,'sorted Auth pair accepts reversed arguments');
select ok(not has_function_privilege('service_role','private.lock_employee_auth_pair(uuid,uuid)','EXECUTE'),'pair-lock helper is not an independently callable service capability');
select throws_ok($$select private.inspect_employee_management('00000000-0000-4000-8000-000000009941','00000000-0000-4000-8000-000000009940','restore-admin-fixture@tuturuuu.com')$$,'42501','Employee administrator access denied','locking lower target first does not authorize higher nonadministrator actor');
update auth.users set banned_until=now()+interval '100 years' where id='00000000-0000-4000-8000-000000009940';
select throws_ok($$select private.inspect_employee_management('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009941','restore-legacy-fixture@tuturuuu.com')$$,'42501','Employee administrator access denied','sorted pair retains fresh banned actor denial');
update auth.users set banned_until=null,email_confirmed_at=null where id='00000000-0000-4000-8000-000000009940';
select throws_ok($$select private.inspect_employee_management('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009941','restore-legacy-fixture@tuturuuu.com')$$,'42501','Employee administrator access denied','sorted pair retains fresh unconfirmed actor denial');
update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-000000009940';
delete from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000009940';
select throws_ok($$select private.inspect_employee_management('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009941','restore-legacy-fixture@tuturuuu.com')$$,'42501','Employee administrator access denied','sorted pair retains fresh root membership denial');
insert into public.workspace_members(ws_id,user_id,type) values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009940','MEMBER');
select private.employee_creation_preflight('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com','Restore fixture');
select private.employee_creation_preflight('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009943','restore-intent-fixture@tuturuuu.com','Intent fixture');
select is(private.inspect_employee_management('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009943',null)->>'reservation','exact_intent','intent-only UUID is inspectable without Auth or email fallback');
select is(private.inspect_employee_management('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009941','restore-legacy-fixture@tuturuuu.com')->>'managed','false','unregistered ordinary staff remains unmanaged');
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',now(),now()+interval '100 years','{"employee_onboarding":true}','{}');
select throws_ok($$select private.begin_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee restoration tuple or revision conflict','pending creation cannot restore');
select private.finalize_employee_creation('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com','Restore fixture');
select throws_ok($$select private.begin_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee restoration tuple or revision conflict','provisioned creation cannot restore');
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000009942';
select private.confirm_employee_activation('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com');
update auth.users set banned_until=now()+interval '100 years' where id='00000000-0000-4000-8000-000000009942';
create temporary table restore_before as select e.user_id,e.mailbox_id,to_jsonb(r) grants,to_jsonb(mb) mailbox
from private.infrastructure_employees e join public.platform_user_roles r on r.user_id=e.user_id
join private.mail_mailboxes mb on mb.id=e.mailbox_id where e.user_id='00000000-0000-4000-8000-000000009942';
select throws_ok($$select private.begin_employee_restore('00000000-0000-4000-8000-000000009945','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'42501','Employee administrator access denied','noncompany actor denied');
select throws_ok($$select private.inspect_employee_management('00000000-0000-4000-8000-000000009942','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com')$$,'42501',null,'self inspection denied');
select throws_ok($$select private.begin_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',1,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee restoration tuple or revision conflict','stale revision denied');
select throws_ok($$select private.begin_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009941','restore-legacy-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee restoration tuple or revision conflict','legacy staff cannot be adopted by restoration');
update private.mail_mailboxes set status='disabled' where id=(select mailbox_id from restore_before);
select throws_ok($$select private.begin_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee restoration tuple or revision conflict','disabled mailbox rejects before operation reservation');
update private.mail_mailboxes set status='active' where id=(select mailbox_id from restore_before);
update private.mail_domains set status='disabled' where domain='tuturuuu.com';
select is(private.inspect_employee_management('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com')->>'mailboxReady','false','disabled domain cannot prove mail readiness');
update private.mail_domains set status='active' where domain='tuturuuu.com';
insert into private.mail_mailbox_members(mailbox_id,user_id,role) select mailbox_id,'00000000-0000-4000-8000-000000009945','viewer' from restore_before;
select is(private.inspect_employee_management('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com')->>'mailboxReady','false','foreign member blocks canonical mailbox proof');
delete from private.mail_mailbox_members where user_id='00000000-0000-4000-8000-000000009945';
-- Deliberately introduce independent UUID/email intent overlap, without touching
-- provider Auth identity. Inspector must reject either overlapping tuple.
update private.employee_creation_intents set staff_email='temporary-fixture@tuturuuu.com' where user_id='00000000-0000-4000-8000-000000009942';
update private.employee_creation_intents set staff_email='restore-target-fixture@tuturuuu.com' where user_id='00000000-0000-4000-8000-000000009943';
select is(private.inspect_employee_management('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com')->>'reservation','conflicting_tuple','independent OR-overlap fails closed');
update private.employee_creation_intents set staff_email='restore-intent-fixture@tuturuuu.com' where user_id='00000000-0000-4000-8000-000000009943';
update private.employee_creation_intents set staff_email='restore-target-fixture@tuturuuu.com' where user_id='00000000-0000-4000-8000-000000009942';
select is(private.begin_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')->>'phase','reserved','begin durably reserves operation');
select ok(exists(select 1 from pg_catalog.pg_locks where pid=pg_catalog.pg_backend_pid() and relation='auth.users'::regclass and mode='RowShareLock'),'inspection acquires Auth FOR UPDATE relation lock in this transaction');
select ok(exists(select 1 from pg_catalog.pg_locks where pid=pg_catalog.pg_backend_pid() and relation='private.infrastructure_employees'::regclass and mode='RowShareLock'),'inspection acquires registry FOR UPDATE relation lock in this transaction');
select throws_ok($$select private.begin_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009951')$$,'23505','Employee operation unresolved','second same-target operation fenced');
select is(private.mark_employee_restore_attempt('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')->>'phase','attempted','attempt durably marked');
select throws_ok($$select private.mark_employee_restore_attempt('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee attempt receipt conflict','replay cannot acknowledge another launch');
select throws_ok($$select private.reconcile_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee provider activation is unconfirmed','reconcile never unbans still banned target');
select is((select phase from private.employee_restore_operations where operation_id='00000000-0000-4000-8000-000000009950'),'attempted','banned reconciliation preserves unresolved receipt');
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000009942';
select throws_ok($$select private.confirm_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009951')$$,'23514','Employee confirmation receipt conflict','wrong receipt cannot close');
select throws_ok($$select private.reconcile_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','wrong-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee confirmation receipt conflict','named reconciliation rejects definite email conflict');
select throws_ok($$select private.reconcile_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',1,'00000000-0000-4000-8000-000000009950')$$,'23514','Employee confirmation receipt conflict','named reconciliation rejects definite receipt revision conflict');
create function pg_temp.fail_restore_confirmation() returns trigger language plpgsql as $$begin raise exception using errcode='23514',message='Synthetic restore receipt fault'; end$$;
create trigger fixture_restore_confirmation_fault before update on private.employee_restore_operations for each row execute function pg_temp.fail_restore_confirmation();
select throws_ok($$select private.confirm_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')$$,'23514','Synthetic restore receipt fault','receipt failure rolls back registry revision');
select is((select revision from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000009942'),0::bigint,'failed close leaves registry revision unchanged');
select is((select phase from private.employee_restore_operations where operation_id='00000000-0000-4000-8000-000000009950'),'attempted','failed close preserves attempted receipt');
drop trigger fixture_restore_confirmation_fault on private.employee_restore_operations;
select is(private.reconcile_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')->>'status','restored','verified existing receipt closes without provisioning');
select is(private.confirm_employee_restore('00000000-0000-4000-8000-000000009940','00000000-0000-4000-8000-000000009942','restore-target-fixture@tuturuuu.com',0,'00000000-0000-4000-8000-000000009950')->>'revision','1','completed receipt replay is idempotent');
select is((select mailbox_id from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000009942'),(select mailbox_id from restore_before),'canonical mailbox UUID unchanged');
select is((select to_jsonb(r) from public.platform_user_roles r where user_id='00000000-0000-4000-8000-000000009942'),(select grants from restore_before),'disabled grant beforeimage unchanged');
select is((select to_jsonb(mb) from private.mail_mailboxes mb where id=(select mailbox_id from restore_before)),(select mailbox from restore_before),'mailbox name/owner/data beforeimage unchanged');
select ok(not has_table_privilege('service_role','private.employee_restore_operations','INSERT'),'service cannot directly insert receipt');
select ok(not has_function_privilege('authenticated','private.begin_employee_restore(uuid,uuid,text,bigint,uuid)','EXECUTE'),'authenticated cannot invoke private restore');
select ok(has_function_privilege('service_role','private.begin_employee_restore(uuid,uuid,text,bigint,uuid)','EXECUTE'),'service-only narrow RPC admitted');
select * from finish();
rollback;
