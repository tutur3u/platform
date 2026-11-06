-- Rollback-only full-schema assertions. Auth effects below are explicit
-- simulations, never GoTrue/email-delivery qualification.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,email_change,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009960','migration-admin-fixture@tuturuuu.com',now(),'','{}','{}'),
('00000000-0000-4000-8000-000000009961','migration-target-fixture@xwf.tuturuuu.com',now(),'','{}','{}');
insert into auth.identities(id,provider_id,user_id,provider,identity_data) values
('00000000-0000-4000-8000-000000009962','00000000-0000-4000-8000-000000009961',
 '00000000-0000-4000-8000-000000009961','email','{"email":"migration-target-fixture@xwf.tuturuuu.com","email_verified":true}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Migration fixture root','00000000-0000-4000-8000-000000009960',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009960','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
insert into private.mail_domains(domain,status) values ('xwf.tuturuuu.com','active')
on conflict(domain) do update set status='active';
insert into private.mail_mailboxes(id,address,domain_id,created_by,type,status)
select '00000000-0000-4000-8000-000000009963','migration-target-fixture@xwf.tuturuuu.com',id,
 '00000000-0000-4000-8000-000000009961','personal','active' from private.mail_domains where domain='xwf.tuturuuu.com';
insert into private.mail_mailboxes(id,address,domain_id,created_by,type,status)
select '00000000-0000-4000-8000-000000009964','migration-target-fixture@tuturuuu.com',id,
 '00000000-0000-4000-8000-000000009961','personal','active' from private.mail_domains where domain='tuturuuu.com';
insert into private.mail_mailbox_members(mailbox_id,user_id,role) values
('00000000-0000-4000-8000-000000009963','00000000-0000-4000-8000-000000009961','owner'),
('00000000-0000-4000-8000-000000009964','00000000-0000-4000-8000-000000009961','owner');
create temporary table migration_fixture as select
'{"actorId":"00000000-0000-4000-8000-000000009960","userId":"00000000-0000-4000-8000-000000009961","operationId":"00000000-0000-4000-8000-000000009965","sourceAddress":"migration-target-fixture@xwf.tuturuuu.com","destinationAddress":"migration-target-fixture@tuturuuu.com","expectedRevision":0}'::jsonb as request;
alter table migration_fixture add column binding jsonb;
update migration_fixture set binding=request||(
 select jsonb_build_object('immutableFingerprint',observation->>'immutableFingerprint',
 'providerIdentityFingerprint',observation->>'providerIdentityFingerprint')
 from (select private.employee_address_migration('inspect',request) observation) s);
select is(private.employee_address_migration('inspect',request)->>'sourceVerified','true','full-schema legacy source and routes ready') from migration_fixture;
select is(private.employee_address_migration('reserve',binding),'true'::jsonb,'durable reservation') from migration_fixture;
select is(private.employee_address_migration('claim',binding,'00000000-0000-4000-8000-000000009966'),'true'::jsonb,'first claim wins') from migration_fixture;
select is(private.employee_address_migration('claim',binding,'00000000-0000-4000-8000-000000009967'),'false'::jsonb,'replay never dispatches') from migration_fixture;
-- Simulate the supported provider's unverified email result. The real existing
-- Auth profile trigger, not this test, must update user_private_details.email.
update auth.users set email='migration-target-fixture@tuturuuu.com' where id='00000000-0000-4000-8000-000000009961';
update auth.identities set identity_data='{"email":"migration-target-fixture@tuturuuu.com","email_verified":false}' where id='00000000-0000-4000-8000-000000009962';
select is((select email from public.user_private_details where user_id='00000000-0000-4000-8000-000000009961'),
 'migration-target-fixture@tuturuuu.com','existing full-schema profile sync converges');
select is(private.employee_address_migration('inspect',request)->>'sourceVerified','false','unverified destination cannot complete') from migration_fixture;
select throws_ok($$select private.employee_address_migration('complete',binding) from migration_fixture$$,'23514','Migration state unavailable','no confirmation override');
select is((select phase from private.employee_address_migrations where user_id='00000000-0000-4000-8000-000000009961'),'attempted','original attempt retained');
select ok(not has_table_privilege('service_role','private.employee_address_migrations','INSERT'),'service cannot directly insert journal');
select ok(not has_function_privilege('authenticated','private.employee_address_migration(text,jsonb,uuid)','EXECUTE'),'user cannot invoke private RPC');
select * from finish();
rollback;
