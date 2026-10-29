-- Rollback-only actual SQL. Provider effects below are simulations, not GoTrue.
begin;
create extension if not exists pgtap with schema extensions;
-- On non-superuser local Postgres, set test.dblink_connstr to a password-authenticated
-- connection to this same disposable database (loopback trust cannot authenticate dblink).
create extension if not exists dblink with schema extensions;
set local search_path=public,extensions;
select plan(30);
insert into auth.users(id,email,email_confirmed_at,email_change,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009970','google-migration-admin@tuturuuu.com',now(),'','{}','{}'),
('00000000-0000-4000-8000-000000009971','google-migration-target@xwf.tuturuuu.com',now(),'','{}','{}');
insert into auth.identities(id,provider_id,user_id,provider,identity_data) values
('00000000-0000-4000-8000-000000009972','stable-google-subject','00000000-0000-4000-8000-000000009971','google',
 '{"sub":"stable-google-subject","email":"google-migration-target@tuturuuu.com","email_verified":true,"name":"Preserved fixture"}');
-- A confirmed address alone is not a verified staff identity.
insert into auth.identities(provider_id,user_id,provider,identity_data)
select id::text,id,'email',jsonb_build_object('sub',id::text,'email',email)
from auth.users where id='00000000-0000-4000-8000-000000009970';
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Google migration root','00000000-0000-4000-8000-000000009970',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009970','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
insert into private.mail_mailboxes(id,address,domain_id,created_by,type,status)
select '00000000-0000-4000-8000-000000009973','google-migration-target@tuturuuu.com',id,null,'personal','disabled'
from private.mail_domains where domain='tuturuuu.com';
create temporary table google_migration_fixture as select
'{"actorId":"00000000-0000-4000-8000-000000009970","userId":"00000000-0000-4000-8000-000000009971","operationId":"00000000-0000-4000-8000-000000009974","sourceAddress":"google-migration-target@xwf.tuturuuu.com","destinationAddress":"google-migration-target@tuturuuu.com","expectedRevision":0}'::jsonb as request;
alter table google_migration_fixture add column binding jsonb;
alter table google_migration_fixture add column original_google jsonb;
update google_migration_fixture set original_google=(select to_jsonb(i)-'updated_at' from auth.identities i where id='00000000-0000-4000-8000-000000009972');
select is(private.employee_address_migration('inspect',request)->>'sourceVerified','false','BEFORE inactive unowned destination is not ready') from google_migration_fixture;
select is(private.employee_address_migration('inspect',request)->>'addressOwnership','conflict','BEFORE placeholder is not owned') from google_migration_fixture;
update private.mail_mailboxes set status='quarantined' where id='00000000-0000-4000-8000-000000009973';
select throws_ok($$select private.employee_address_migration('prepare',request) from google_migration_fixture$$,'23514','Mailbox preparation unavailable','quarantine is not a placeholder');
update private.mail_mailboxes set status='disabled' where id='00000000-0000-4000-8000-000000009973';
insert into private.mail_mailbox_members(mailbox_id,user_id,role) values('00000000-0000-4000-8000-000000009973','00000000-0000-4000-8000-000000009970','viewer');
select throws_ok($$select private.employee_address_migration('prepare',request) from google_migration_fixture$$,'23514','Mailbox preparation unavailable','any existing member prevents adoption');
delete from private.mail_mailbox_members where mailbox_id='00000000-0000-4000-8000-000000009973';
update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false') where id='00000000-0000-4000-8000-000000009972';
select throws_ok($$select private.employee_address_migration('prepare',request) from google_migration_fixture$$,'23514','Mailbox preparation unavailable','unverified Google claim cannot authorize preparation');
update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','true') where id='00000000-0000-4000-8000-000000009972';
update private.mail_mailboxes set type='shared' where id='00000000-0000-4000-8000-000000009973';
select throws_ok($$select private.employee_address_migration('prepare',request) from google_migration_fixture$$,'23514','Mailbox preparation unavailable','shared mailbox cannot be adopted');
update private.mail_mailboxes set type='personal' where id='00000000-0000-4000-8000-000000009973';
insert into private.mail_threads(id,mailbox_id,subject) values('00000000-0000-4000-8000-000000009977','00000000-0000-4000-8000-000000009973','Retained fixture data');
select throws_ok($$select private.employee_address_migration('prepare',request) from google_migration_fixture$$,'23514','Mailbox preparation has retained data','zero members does not prove an empty mailbox');
delete from private.mail_threads where id='00000000-0000-4000-8000-000000009977';
update auth.identities set identity_data=jsonb_set(identity_data,'{email}','"google-migration-target@xwf.tuturuuu.com"') where id='00000000-0000-4000-8000-000000009972';
select throws_ok($$select private.employee_address_migration('prepare',request) from google_migration_fixture$$,'23514','Mailbox preparation unavailable','verified source is not verified destination');
update auth.identities set identity_data=jsonb_set(identity_data,'{email}','"google-migration-target@tuturuuu.com"'),provider_id='different-subject' where id='00000000-0000-4000-8000-000000009972';
select throws_ok($$select private.employee_address_migration('prepare',request) from google_migration_fixture$$,'23514','Mailbox preparation unavailable','provider id must equal subject');
update auth.identities set provider_id='stable-google-subject' where id='00000000-0000-4000-8000-000000009972';
-- A real independent connection holds the FK-writer table lock. It does not
-- need visibility of the outer transaction's uncommitted synthetic account.
create function pg_temp.google_preparation_busy(p_request jsonb) returns boolean
language plpgsql as $$ begin
  perform private.employee_address_migration('prepare',p_request);
  return false;
exception when lock_not_available then return true; end; $$;
do $control$ begin
  perform dblink_connect('google_migration_fk_fixture',coalesce(nullif(current_setting('test.dblink_connstr', true), ''), format('dbname=%L user=%L',current_database(),current_user)));
  perform dblink_exec('google_migration_fk_fixture','begin; lock table private.mail_threads in row exclusive mode');
end; $control$;
select ok(exists(select 1 from pg_locks where pid=(select pid from dblink('google_migration_fk_fixture','select pg_backend_pid()') as remote(pid integer))
  and relation='private.mail_threads'::regclass and mode='RowExclusiveLock' and granted),'control independently holds the exact FK-writer lock');
select ok(pg_temp.google_preparation_busy(request),'preparation fails with SQLSTATE55P03 rather than waiting for FK writer') from google_migration_fixture;
select is(jsonb_build_object('unownedDisabled',(select created_by is null and status='disabled' from private.mail_mailboxes where id='00000000-0000-4000-8000-000000009973'),
  'owners',(select count(*) from private.mail_mailbox_members where mailbox_id='00000000-0000-4000-8000-000000009973'),
  'operations',(select count(*) from private.employee_address_migrations where user_id='00000000-0000-4000-8000-000000009971'),
  'authEmail',(select email from auth.users where id='00000000-0000-4000-8000-000000009971')),
  '{"unownedDisabled":true,"owners":0,"operations":0,"authEmail":"google-migration-target@xwf.tuturuuu.com"}'::jsonb,'busy preparation leaves exact ownership, journal and Auth state unchanged');
do $control$ begin
  perform dblink_exec('google_migration_fk_fixture','rollback');
  perform dblink_disconnect('google_migration_fk_fixture');
end; $control$;
select ok(not coalesce('google_migration_fk_fixture'=any(dblink_get_connections()),false),'owned blocking connection is drained before successful preparation');
select throws_ok($test$do $probe$
declare fixture jsonb;
begin
  select request into fixture from google_migration_fixture;
  insert into private.employee_address_migrations(operation_id,user_id,source_address,destination_address,binding,phase,attempt_id,original_state,transition_kind)
  values((fixture->>'operationId')::uuid,(fixture->>'userId')::uuid,fixture->>'sourceAddress',fixture->>'destinationAddress',fixture,'attempted',
    '00000000-0000-4000-8000-000000009975',private.employee_address_google_state((fixture->>'userId')::uuid,fixture->>'sourceAddress',fixture->>'destinationAddress',false),'google_destination');
  perform private.employee_address_migration('prepare',jsonb_set(fixture,'{operationId}','"00000000-0000-4000-8000-000000009979"'));
  raise exception using errcode='P0001',message='Replacement UUID unexpectedly prepared';
end; $probe$;$test$,'23514','Mailbox preparation conflict','a replacement UUID cannot bypass an existing attempt');
select is(private.employee_address_migration('prepare',request)->>'prepared','true','explicit preparation commits no Auth changes') from google_migration_fixture;
select is(jsonb_build_object(
  'ownedActive',(select created_by='00000000-0000-4000-8000-000000009971' and status='active' from private.mail_mailboxes where id='00000000-0000-4000-8000-000000009973'),
  'owners',(select count(*) from private.mail_mailbox_members where mailbox_id='00000000-0000-4000-8000-000000009973' and user_id='00000000-0000-4000-8000-000000009971' and role='owner'),
  'legacyRoutes',(select count(*) from private.mail_mailboxes where address='google-migration-target@xwf.tuturuuu.com'),
  'authEmail',(select email from auth.users where id='00000000-0000-4000-8000-000000009971'),
  'ready',private.employee_address_migration('inspect',request)->'sourceVerified',
  'fkShareLock',exists(select 1 from pg_locks where pid=pg_backend_pid() and relation='private.mail_threads'::regclass and mode='ShareLock' and granted)),
  '{"ownedActive":true,"owners":1,"legacyRoutes":0,"authEmail":"google-migration-target@xwf.tuturuuu.com","ready":true,"fkShareLock":true}'::jsonb,
  'post-preparation readback retains exact ownership, no legacy route, unchanged Auth and FK writer fence') from google_migration_fixture;
update google_migration_fixture set binding=request||(
select jsonb_build_object('immutableFingerprint',o->>'immutableFingerprint','providerIdentityFingerprint',o->>'providerIdentityFingerprint')
from (select private.employee_address_migration('inspect',request) o) s);
select is(private.employee_address_migration('reserve',binding),'true'::jsonb,'fresh prepared binding reserved') from google_migration_fixture;
select is(private.employee_address_migration('claim',binding,'00000000-0000-4000-8000-000000009975'),'true'::jsonb,'one provider attempt') from google_migration_fixture;
select throws_ok($$select private.employee_address_migration('prepare',request) from google_migration_fixture$$,'23514','Mailbox preparation unavailable','attempt cannot be reset by preparation');
-- GoTrue admin {email,email_confirm:true}: one new verified email identity,
-- unchanged Google identity, same Auth UUID. This SQL simulation is not a PUT.
update auth.users set email='google-migration-target@tuturuuu.com' where id='00000000-0000-4000-8000-000000009971';
insert into auth.identities(id,provider_id,user_id,provider,identity_data) values
('00000000-0000-4000-8000-000000009976','00000000-0000-4000-8000-000000009971','00000000-0000-4000-8000-000000009971','email',
 '{"sub":"00000000-0000-4000-8000-000000009971","email":"google-migration-target@tuturuuu.com","email_verified":true}');
select is(private.employee_address_migration('inspect',request)->>'sourceVerified','true','bounded identity addition accepted') from google_migration_fixture;
select isnt(private.employee_address_migration('inspect',request)->>'providerIdentityFingerprint',binding->>'providerIdentityFingerprint','actual post identity hash differs from original') from google_migration_fixture;
select isnt(private.employee_address_migration('inspect',request)->>'immutableFingerprint',binding->>'immutableFingerprint','actual post immutable hash differs from original') from google_migration_fixture;
update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false') where id='00000000-0000-4000-8000-000000009976';
select is(private.employee_address_migration('inspect',request)->>'sourceVerified','false','added identity must actually be verified') from google_migration_fixture;
update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','true') where id='00000000-0000-4000-8000-000000009976';
insert into auth.identities(id,provider_id,user_id,provider,identity_data) values
('00000000-0000-4000-8000-000000009978','foreign-provider-subject','00000000-0000-4000-8000-000000009971','github',
 '{"email":"google-migration-target@tuturuuu.com","email_verified":true}');
select is(private.employee_address_migration('inspect',request)->>'sourceVerified','false','unrelated provider addition cannot qualify') from google_migration_fixture;
delete from auth.identities where id='00000000-0000-4000-8000-000000009978';
select is(private.employee_address_migration('complete',binding),'true'::jsonb,'completion stores independently observed transition') from google_migration_fixture;
select is((private.employee_address_migration('inspect',request)->'record'->'transition'),private.employee_address_migration('inspect',request)->'transition','persisted after receipt matches independent readback') from google_migration_fixture;
select is((select to_jsonb(i)-'updated_at' from auth.identities i where id='00000000-0000-4000-8000-000000009972'),original_google,'Google provider id, subject and complete data preserved') from google_migration_fixture;
select is(private.employee_address_migration('inspect',request)->>'revision','1','exact next revision') from google_migration_fixture;
update auth.identities set identity_data=jsonb_set(identity_data,'{name}','"Changed"') where id='00000000-0000-4000-8000-000000009972';
select is(private.employee_address_migration('inspect',request)->>'sourceVerified','false','Google metadata drift invalidates completed observation') from google_migration_fixture;
select ok(not has_function_privilege('service_role','private.employee_address_google_state(uuid,text,text,boolean)','EXECUTE'),'service cannot bypass the guarded RPC to read snapshots');
select * from finish();
rollback;
