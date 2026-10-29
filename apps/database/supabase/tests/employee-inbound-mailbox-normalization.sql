-- Real-function, rollback-only fixtures; requires the separately applied amendment.
-- Auth writes below simulate provider state only inside this test transaction.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
set local search_path = public, extensions;
select plan(20);

-- Provider inserts use a service identity without impersonating the administrator.
-- Employee RPCs receive the independently provisioned administrator UUID below.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims',
  '{"role":"service_role"}',true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000094501','inbound-admin-fixture@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000094502','inbound-foreign-fixture@example.com',now(),'{}','{}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Inbound fixture','00000000-0000-4000-8000-000000094501',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000094501','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
select set_config('inbound_fixture.domain_id',
  (select id::text from private.mail_domains where domain='tuturuuu.com' and status='active'),true);
set local role service_role;
select private.employee_creation_preflight('00000000-0000-4000-8000-000000094501',
  '00000000-0000-4000-8000-000000094503','inbound-normalization-fixture@tuturuuu.com','Inbound fixture');
select is(private.employee_inbound_mailbox('inbound-normalization-fixture@tuturuuu.com',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'01: canonical retained intent denies delivery');
select is(private.employee_inbound_mailbox('Inbound-Normalization-Fixture@TUTURUUU.COM',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'02: mixed case retained intent denies delivery');
select is(private.employee_inbound_mailbox('  inbound-normalization-fixture@tuturuuu.com  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'03: padded retained intent denies delivery');
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'04: mixed case padded retained intent denies delivery');
reset role;
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000094503','inbound-normalization-fixture@tuturuuu.com',now(),
 now()+interval '100 years','{"employee_onboarding":true}',
 '{"display_name":"Inbound fixture","full_name":"Inbound fixture"}');
-- Real Auth users carry a provider identity; verified staff checks require one.
insert into auth.identities(id,provider_id,user_id,identity_data,provider)
select gen_random_uuid(),u.id::text,u.id,jsonb_build_object('sub',u.id::text,'email',u.email),'email'
from auth.users u where not exists(select 1 from auth.identities i where i.user_id=u.id);
set local role service_role;
select private.finalize_employee_creation('00000000-0000-4000-8000-000000094501',
  '00000000-0000-4000-8000-000000094503','inbound-normalization-fixture@tuturuuu.com','Inbound fixture');
reset role;
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000094503';
set local role service_role;
select private.confirm_employee_activation('00000000-0000-4000-8000-000000094501',
  '00000000-0000-4000-8000-000000094503','inbound-normalization-fixture@tuturuuu.com');
reset role;
select set_config('inbound_fixture.mailbox',
  (select to_jsonb(m)::text from private.mail_mailboxes m
   where address='inbound-normalization-fixture@tuturuuu.com'),true);
set local role service_role;
select is(private.employee_inbound_mailbox('inbound-normalization-fixture@tuturuuu.com',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',current_setting('inbound_fixture.mailbox')::jsonb),'05: canonical active recipient returns exact mailbox');
select is(private.employee_inbound_mailbox('Inbound-Normalization-Fixture@TUTURUUU.COM',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',current_setting('inbound_fixture.mailbox')::jsonb),'06: mixed case active recipient returns exact mailbox');
select is(private.employee_inbound_mailbox('  inbound-normalization-fixture@tuturuuu.com  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',current_setting('inbound_fixture.mailbox')::jsonb),'07: padded active recipient returns exact mailbox');
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',current_setting('inbound_fixture.mailbox')::jsonb),'08: mixed case padded active recipient returns exact mailbox');
select is(private.employee_inbound_mailbox(null,current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',false),'09: null recipient remains unmanaged');
select is(private.employee_inbound_mailbox('  Unknown-Inbound-Fixture@EXAMPLE.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',false),'10: unknown recipient remains unmanaged');
reset role;
update private.infrastructure_employees set lifecycle_state='pending' where user_id='00000000-0000-4000-8000-000000094503';
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'11: pending registry denies normalized recipient');
reset role;
update private.infrastructure_employees set lifecycle_state='active' where user_id='00000000-0000-4000-8000-000000094503';
reset role;
update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-4000-8000-000000094503';
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'12: banned identity denies normalized recipient');
reset role;
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000094503';
reset role;
update auth.users set raw_app_meta_data=jsonb_build_object('employee_onboarding',false) where id='00000000-0000-4000-8000-000000094503';
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'13: false onboarding marker denies normalized recipient');
reset role;
update auth.users set raw_app_meta_data=jsonb_build_object('employee_onboarding',true) where id='00000000-0000-4000-8000-000000094503';
reset role;
update private.mail_mailboxes set status='disabled' where address='inbound-normalization-fixture@tuturuuu.com';
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'14: disabled mailbox denies normalized recipient');
reset role;
update private.mail_mailboxes set status='active' where address='inbound-normalization-fixture@tuturuuu.com';
reset role;
update private.mail_mailboxes set created_by='00000000-0000-4000-8000-000000094502' where address='inbound-normalization-fixture@tuturuuu.com';
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'15: conflicting mailbox creator denies normalized recipient');
reset role;
update private.mail_mailboxes set created_by='00000000-0000-4000-8000-000000094503' where address='inbound-normalization-fixture@tuturuuu.com';
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ','00000000-0000-4000-8000-000000094599'::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'16: wrong tenant domain id denies normalized recipient');
reset role;
update private.mail_domains set status='disabled' where id=current_setting('inbound_fixture.domain_id')::uuid;
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'17: inactive canonical domain denies normalized recipient');
reset role;
update private.mail_domains set status='active' where id=current_setting('inbound_fixture.domain_id')::uuid;
reset role;
update private.mail_domains set domain='inbound-normalization-fixture.example.com' where id=current_setting('inbound_fixture.domain_id')::uuid;
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'18: noncanonical domain name denies normalized recipient');
reset role;
update private.mail_domains set domain='tuturuuu.com' where id=current_setting('inbound_fixture.domain_id')::uuid;
reset role;
update private.mail_mailbox_members set role='viewer' where mailbox_id=(current_setting('inbound_fixture.mailbox')::jsonb->>'id')::uuid;
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'19: missing owner membership denies normalized recipient');
reset role;
update private.mail_mailbox_members set role='owner' where mailbox_id=(current_setting('inbound_fixture.mailbox')::jsonb->>'id')::uuid;
reset role;
insert into private.mail_mailbox_members(mailbox_id,user_id,role,created_by) values
((current_setting('inbound_fixture.mailbox')::jsonb->>'id')::uuid,
 '00000000-0000-4000-8000-000000094502','viewer','00000000-0000-4000-8000-000000094501');
set local role service_role;
select is(private.employee_inbound_mailbox('  Inbound-Normalization-Fixture@TUTURUUU.COM  ',current_setting('inbound_fixture.domain_id')::uuid),
  jsonb_build_object('managed',true,'mailbox',null),'20: foreign extra membership denies normalized recipient');
reset role;
select * from finish();
rollback;
