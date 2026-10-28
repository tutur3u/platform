\ir helpers/local-dblink.inc
\if :fixture_dblink_available
-- Rollback-only actual SQL. Provider effects below are simulations, not GoTrue.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path=public,extensions;
select plan(41);
insert into auth.users(id,email,email_confirmed_at,email_change,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009970','retained-adoption-admin@tuturuuu.com',now(),'','{}','{}'),
('00000000-0000-4000-8000-000000009971','retained-adoption-target@xwf.tuturuuu.com',now(),'','{}','{}');
insert into auth.identities(id,provider_id,user_id,provider,identity_data) values
('00000000-0000-4000-8000-000000009972','stable-google-subject','00000000-0000-4000-8000-000000009971','google',
 '{"sub":"stable-google-subject","email":"retained-adoption-target@tuturuuu.com","email_verified":true,"name":"Preserved fixture"}');
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
select '00000000-0000-4000-8000-000000009973','retained-adoption-target@tuturuuu.com',id,null,'personal','disabled'
from private.mail_domains where domain='tuturuuu.com';
create temporary table retained_adoption_fixture as select
'{"actorId":"00000000-0000-4000-8000-000000009970","userId":"00000000-0000-4000-8000-000000009971","operationId":"00000000-0000-4000-8000-000000009974","sourceAddress":"retained-adoption-target@xwf.tuturuuu.com","destinationAddress":"retained-adoption-target@tuturuuu.com","expectedRevision":0}'::jsonb as request;
alter table retained_adoption_fixture add column binding jsonb;
alter table retained_adoption_fixture add column original_google jsonb;
update retained_adoption_fixture set original_google=(select to_jsonb(i)-'updated_at' from auth.identities i where id='00000000-0000-4000-8000-000000009972');

insert into private.mail_threads(id,mailbox_id,subject) values
('00000000-0000-4000-8000-000000009977','00000000-0000-4000-8000-000000009973','Preserve every byte');
insert into private.mail_messages(id,mailbox_id,thread_id,direction,from_address,body_text) values
('00000000-0000-4000-8000-000000009978','00000000-0000-4000-8000-000000009973','00000000-0000-4000-8000-000000009977','inbound','sender@example.test','retained fixture body');
insert into private.mail_labels(mailbox_id,name,slug) values('00000000-0000-4000-8000-000000009973','Retained','retained');
insert into private.mail_stored_objects(mailbox_id,message_id,provider,object_kind,bucket_name,object_key,size_bytes,sha256)
values('00000000-0000-4000-8000-000000009973','00000000-0000-4000-8000-000000009978','r2','body','fixture','retained-object',5,'fixture-hash');
insert into private.mail_stored_objects(id,mailbox_id,message_id,provider,object_kind,bucket_name,object_key,size_bytes,sha256) values
('00000000-0000-4000-8000-000000009981','00000000-0000-4000-8000-000000009973','00000000-0000-4000-8000-000000009978','r2','raw_mime','fixture','retained-raw',10,repeat('a',64)),
('00000000-0000-4000-8000-000000009982','00000000-0000-4000-8000-000000009973','00000000-0000-4000-8000-000000009978','r2','attachment','fixture','retained-attachment',5,repeat('b',64));
insert into private.mail_raw_messages(id,provider,provider_message_id,stored_object_id,provider_payload)
values('00000000-0000-4000-8000-000000009980','ses','retained-fixture-provider-message','00000000-0000-4000-8000-000000009981','{"fixture":"original"}');
update private.mail_messages set raw_message_id='00000000-0000-4000-8000-000000009980' where id='00000000-0000-4000-8000-000000009978';
insert into private.mail_attachments(id,message_id,raw_message_id,stored_object_id,filename,size_bytes)
values('00000000-0000-4000-8000-000000009983','00000000-0000-4000-8000-000000009978','00000000-0000-4000-8000-000000009980','00000000-0000-4000-8000-000000009982','retained.txt',5);
insert into private.mail_recipients(id,message_id,kind,address)
values('00000000-0000-4000-8000-000000009984','00000000-0000-4000-8000-000000009978','to','retained-adoption-target@tuturuuu.com');
insert into private.mail_message_labels(message_id,label_id)
select '00000000-0000-4000-8000-000000009978',id from private.mail_labels
where mailbox_id='00000000-0000-4000-8000-000000009973' and slug='retained';
alter table retained_adoption_fixture add column indirect jsonb;
update retained_adoption_fixture set indirect=jsonb_build_object(
  'raw',(select to_jsonb(r) from private.mail_raw_messages r where id='00000000-0000-4000-8000-000000009980'),
  'attachment',(select to_jsonb(a) from private.mail_attachments a where id='00000000-0000-4000-8000-000000009983'),
  'recipient',(select to_jsonb(r) from private.mail_recipients r where id='00000000-0000-4000-8000-000000009984'),
  'messageLabel',(select to_jsonb(l) from private.mail_message_labels l where message_id='00000000-0000-4000-8000-000000009978'));
alter table retained_adoption_fixture add column snapshot text;
alter table retained_adoption_fixture add column content text;
alter table retained_adoption_fixture add column original_state jsonb;
update retained_adoption_fixture set original_state=private.employee_address_google_state(
  (request->>'userId')::uuid,request->>'sourceAddress',request->>'destinationAddress',false),
  content=private.employee_retained_mailbox_content('00000000-0000-4000-8000-000000009973',(request->>'userId')::uuid);
select throws_ok($$select private.employee_address_migration('prepare',request) from retained_adoption_fixture$$,
  '23514','Mailbox preparation has retained data','default empty-only prepare remains closed');
create function pg_temp.retained_adoption_busy(p_request jsonb) returns boolean
language plpgsql as $$ begin
  perform private.employee_retained_mailbox_adoption('inspect',p_request);
  return false;
exception when lock_not_available then return true; end; $$;
select ok(not exists(select 1 from pg_locks where pid=pg_backend_pid()
  and relation='private.mail_threads'::regclass and mode='ShareRowExclusiveLock' and granted),
  'remote writer starts before a successful inspection retains its table fence');
do $control$ begin
  perform dblink_connect('retained_adoption_writer',pg_temp.fixture_dblink_connstr());
  perform dblink_exec('retained_adoption_writer','begin; lock table private.mail_threads in row exclusive mode');
end $control$;
select ok(exists(select 1 from pg_locks where pid=(select pid from dblink('retained_adoption_writer','select pg_backend_pid()') as remote(pid integer))
  and relation='private.mail_threads'::regclass and mode='RowExclusiveLock' and granted),'independent graph writer holds exact lock');
select ok(pg_temp.retained_adoption_busy(request),'concurrent graph writer fails NOWAIT without mutation') from retained_adoption_fixture;
do $control$ begin
  perform dblink_exec('retained_adoption_writer','rollback');
  perform dblink_disconnect('retained_adoption_writer');
end $control$;
select is(private.employee_retained_mailbox_adoption('inspect',request)->>'status','eligible','retained data is explicitly eligible') from retained_adoption_fixture;
update retained_adoption_fixture set snapshot=private.employee_retained_mailbox_adoption('inspect',request)->>'snapshot';
select is((select count(*) from private.employee_mailbox_adoptions),0::bigint,'inspection creates no receipt');
select throws_ok($$select private.employee_retained_mailbox_adoption('adopt',request,snapshot,false) from retained_adoption_fixture$$,
  '23514','Retained ownership confirmation or snapshot unavailable','ownership confirmation required');
select throws_ok($$select private.employee_retained_mailbox_adoption('adopt',request,repeat('a',64),true) from retained_adoption_fixture$$,
  '23514','Retained ownership confirmation or snapshot unavailable','snapshot must match');
select throws_ok($$do $probe$ begin
  update private.mail_messages set body_text='changed' where id='00000000-0000-4000-8000-000000009978';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained ownership confirmation or snapshot unavailable','new retained bytes invalidate confirmation');
select throws_ok($$do $probe$ begin
  update private.mail_raw_messages set provider_payload='{}' where id='00000000-0000-4000-8000-000000009980';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained ownership confirmation or snapshot unavailable','raw message payload drift invalidates the reviewed indirect digest');
select throws_ok($$do $probe$ begin
  update private.mail_attachments set filename='changed.txt' where id='00000000-0000-4000-8000-000000009983';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained ownership confirmation or snapshot unavailable','attachment drift invalidates the reviewed indirect digest');
select throws_ok($$do $probe$ begin
  update private.mail_recipients set address='changed@example.test' where id='00000000-0000-4000-8000-000000009984';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained ownership confirmation or snapshot unavailable','recipient drift invalidates the reviewed indirect digest');
select throws_ok($$do $probe$ begin
  update private.mail_message_labels set created_at=created_at+interval '1 second' where message_id='00000000-0000-4000-8000-000000009978';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained ownership confirmation or snapshot unavailable','message label drift invalidates the reviewed indirect digest');
select throws_ok($$do $probe$ begin
  insert into private.mail_mailbox_members(mailbox_id,user_id,role) values
    ('00000000-0000-4000-8000-000000009973','00000000-0000-4000-8000-000000009970','viewer');
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained adoption conflict','foreign member blocks adoption');
select throws_ok($$do $probe$ begin
  update private.mail_messages set created_by='00000000-0000-4000-8000-000000009970' where id='00000000-0000-4000-8000-000000009978';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained mailbox graph unavailable','foreign author cannot be confirmed away');
select throws_ok($$do $probe$ begin
  create table private.adoption_unreviewed_fk(mailbox_id uuid references private.mail_mailboxes(id));
  perform private.employee_retained_mailbox_adoption('inspect',request) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained mailbox catalog unavailable','new empty FK is rejected');
select throws_ok($$do $probe$ begin
  create table private.adoption_unreviewed_graph(message_id uuid references private.mail_messages(id));
  perform private.employee_retained_mailbox_adoption('inspect',request) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained mailbox graph catalog unavailable','new reverse graph FK is rejected');
select throws_ok($$do $probe$ begin
  update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false') where id='00000000-0000-4000-8000-000000009972';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained adoption conflict','revoked verified claim fails closed');
select throws_ok($$select private.employee_retained_mailbox_adoption('adopt',jsonb_set(request,'{expectedRevision}','1'),snapshot,true) from retained_adoption_fixture$$,
  '23514','Invalid address migration tuple','exact revision required');
select throws_ok($$select private.employee_retained_mailbox_adoption('inspect',jsonb_set(request,'{actorId}',to_jsonb(request->>'userId'))) from retained_adoption_fixture$$,
  '23514','Invalid address migration tuple','target cannot self-authorize');
select throws_ok($$do $probe$ begin
  alter table private.mail_mailboxes add constraint adoption_composite_unique unique(id,address);
  create table private.adoption_composite_fk(mailbox_id uuid,address text,
    foreign key(mailbox_id,address) references private.mail_mailboxes(id,address));
  perform private.employee_retained_mailbox_adoption('inspect',request) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained mailbox catalog unavailable','composite FK fails closed');
select throws_ok($$do $probe$ begin
  update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-4000-8000-000000009970';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'42501','Employee administrator access denied','fresh actor revocation blocks adoption');
select throws_ok($$do $probe$ begin
  insert into private.mail_mailboxes(id,address,domain_id,created_by,type,status)
    select '00000000-0000-4000-8000-000000009976','retained-other@tuturuuu.com',id,null,'personal','disabled'
    from private.mail_domains where domain='tuturuuu.com';
  update private.mail_threads set mailbox_id='00000000-0000-4000-8000-000000009976'
    where id='00000000-0000-4000-8000-000000009977';
  perform private.employee_retained_mailbox_adoption('adopt',request,snapshot,true) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained mailbox graph unavailable','cross-mailbox graph cannot be confirmed away');
select is(private.employee_retained_mailbox_adoption('adopt',request,snapshot,true)->>'status','adopted','explicit adoption preserves populated mailbox') from retained_adoption_fixture;
select is(private.employee_retained_mailbox_adoption('inspect',request)->>'snapshot',snapshot,'original operation recovers lost acknowledgement') from retained_adoption_fixture;
select is(private.employee_retained_mailbox_adoption('adopt',request,snapshot,true)->>'status','adopted','exact committed receipt is idempotent') from retained_adoption_fixture;
select is((select count(*) from private.employee_mailbox_adoptions),1::bigint,'one durable receipt');
select is(private.employee_retained_mailbox_content('00000000-0000-4000-8000-000000009973',(request->>'userId')::uuid),content,
  'all retained row bytes and object references preserved') from retained_adoption_fixture;
select is((select to_jsonb(r) from private.mail_raw_messages r where id='00000000-0000-4000-8000-000000009980'),
  indirect->'raw','populated raw message bytes and stored object reference preserved') from retained_adoption_fixture;
select is((select to_jsonb(r) from private.mail_attachments r where id='00000000-0000-4000-8000-000000009983'),
  indirect->'attachment','populated attachment bytes and both object references preserved') from retained_adoption_fixture;
select is((select to_jsonb(r) from private.mail_recipients r where id='00000000-0000-4000-8000-000000009984'),
  indirect->'recipient','populated recipient row bytes preserved') from retained_adoption_fixture;
select is((select to_jsonb(r) from private.mail_message_labels r where message_id='00000000-0000-4000-8000-000000009978'),
  indirect->'messageLabel','populated message label assignment bytes preserved') from retained_adoption_fixture;
select is(private.employee_address_google_state((request->>'userId')::uuid,request->>'sourceAddress',request->>'destinationAddress',false)-'mailboxes'-'mailMemberships',
  original_state-'mailboxes'-'mailMemberships','Auth UUID identity profile workspace membership and history preserved') from retained_adoption_fixture;
select is(private.employee_address_migration('inspect',request)->>'sourceVerified','true','committed adoption yields ordinary migration readiness') from retained_adoption_fixture;
select throws_ok($$select private.employee_retained_mailbox_adoption('inspect',jsonb_set(request,'{operationId}','"00000000-0000-4000-8000-000000009979"')) from retained_adoption_fixture$$,
  '23514','Retained mailbox unavailable','replacement operation cannot adopt again');
select throws_ok($$do $probe$ begin
  update private.mail_messages set body_text='post-adoption drift' where id='00000000-0000-4000-8000-000000009978';
  perform private.employee_retained_mailbox_adoption('inspect',request) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained adoption drift','receipt recovery rejects changed retained content');
select throws_ok($$do $probe$ begin
  insert into private.mail_mailbox_members(mailbox_id,user_id,role) values
    ('00000000-0000-4000-8000-000000009973','00000000-0000-4000-8000-000000009970','viewer');
  perform private.employee_retained_mailbox_adoption('inspect',request) from retained_adoption_fixture;
end $probe$;$$,'23514','Retained adoption drift','receipt recovery rejects foreign membership');
update retained_adoption_fixture set binding=request||jsonb_build_object(
  'immutableFingerprint',private.employee_address_migration('inspect',request)->>'immutableFingerprint',
  'providerIdentityFingerprint',private.employee_address_migration('inspect',request)->>'providerIdentityFingerprint');
select is(private.employee_address_migration('reserve',binding),'true'::jsonb,'existing reserve accepts the original operation') from retained_adoption_fixture;
select throws_ok($$update private.employee_address_migrations
  set operation_id='00000000-0000-4000-8000-000000009979' where operation_id='00000000-0000-4000-8000-000000009974'$$,
  '23514','Retained adoption requires original migration operation','reservation trigger rejects replacement operation');
select throws_ok($$update private.employee_address_migrations
  set binding=jsonb_set(binding,'{expectedRevision}','1') where operation_id='00000000-0000-4000-8000-000000009974'$$,
  '23514','Retained adoption requires original migration operation','reservation trigger rejects changed binding');
select is((select count(*) from private.mail_mailbox_members where mailbox_id='00000000-0000-4000-8000-000000009973'),1::bigint,'exactly one owner membership without deleting retained rows');
select * from finish();
rollback;

\else
select '1..0 # SKIP Independent SQL sessions unavailable: use the stock local Supabase network or set test.dblink_connstr to a password-authenticated connection to this disposable database; loopback trust is insufficient.';
\endif
