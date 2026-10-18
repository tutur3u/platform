-- Root-admitted disposable full b06 schema only. No reduced-schema stubs.
\if :{?mail_source_sha}
\else
\echo 'Held: execute only through the root-admitted Mail controller'
\quit 3
\endif
\if :{?mail_transport_hash}
\else
\quit 3
\endif
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '90s';
set local app.service_role_key = '';
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select set_config('mail.fixture.source', :'mail_source_sha', true) as source \gset
select set_config('mail.fixture.transport', :'mail_transport_hash', true) as transport \gset

-- The controller proves an INTERNAL network and hashes the transport body before
-- this connection. Cron is unchanged and cannot route outside that network.
do $$
begin
 if current_setting('mail.fixture.source') <> 'b06aef6987eb8272dd260c97b7e12b335aee025b'
 or (select md5(prosrc) from pg_proc where oid='public.trigger_immediate_notification_send()'::regprocedure)
    <> current_setting('mail.fixture.transport') then
  raise exception 'Source or frozen transport function mismatch';
 end if;
 if exists(select 1 from auth.users where id::text like '62550000-0000-4000-8000-%')
 or exists(select 1 from private.mail_domains where domain='mail-fixture6255.tuturuuu.com')
 or exists(select 1 from private.mail_mailboxes where id::text like '62550000-0000-4000-8000-%') then
  raise exception 'Synthetic namespace collision';
 end if;
 if (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
   where t.tgrelid='private.notification_batches'::regclass
   and t.tgname='trigger_send_immediate_notification' and t.tgenabled='O'
   and p.oid='public.trigger_immediate_notification_send()'::regprocedure) <> 1 then
  raise exception 'Unexpected transport trigger';
 end if;
end;
$$;
alter table private.notification_batches disable trigger trigger_send_immediate_notification;
select plan(40);

select ok((select not attnotnull from pg_attribute where attrelid='private.mail_notification_receipts'::regclass and attname='event_key'),'historical receipt key remains nullable');
select ok((select indisunique and pg_get_expr(indpred,indrelid)='(event_key IS NOT NULL)' from pg_index where indexrelid='private.mail_notification_receipts_event_owner_key'::regclass),'physical event owner index is unique and partial');
select ok((select relrowsecurity from pg_class where oid='private.mail_notification_receipts'::regclass),'receipt table retains RLS');
select is((select count(*)::int from pg_constraint where conrelid='private.mail_notification_receipts'::regclass and contype='f'),3,'receipt uses real message user and notification FKs');
select ok(not has_function_privilege('authenticated','private.mail_push_recipient_allowed(uuid,uuid)','EXECUTE'),'browser cannot call recipient authority');
select ok(not has_function_privilege('anon','private.mail_inbound_push_message_allowed(uuid)','EXECUTE'),'anonymous cannot call message authority');
select ok((select tgenabled='O' from pg_trigger where tgrelid='private.mail_message_labels'::regclass and tgname='notify_incoming_mail'),'real admission trigger stays enabled');
select ok((select tgenabled='D' from pg_trigger where tgrelid='private.notification_batches'::regclass and tgname='trigger_send_immediate_notification'),'only immediate transport is disabled transactionally');

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
 ('62550000-0000-4000-8000-000000000001','authenticated','authenticated','fixture6255-one@mail-fixture6255.tuturuuu.com',now(),now(),now()),
 ('62550000-0000-4000-8000-000000000002','authenticated','authenticated','fixture6255-two@mail-fixture6255.tuturuuu.com',now(),now(),now());
select is((select count(*)::int from public.users where id in ('62550000-0000-4000-8000-000000000001','62550000-0000-4000-8000-000000000002')),2,'real Auth trigger creates public users');
select is((select count(*)::int from public.workspaces w join public.workspace_members m on m.ws_id=w.id and m.user_id=w.creator_id where w.personal and w.creator_id in ('62550000-0000-4000-8000-000000000001','62550000-0000-4000-8000-000000000002')),2,'real personal workspace and membership contracts hold');
insert into private.mail_domains(id,domain,status,inbound_provider,verified_at) values
 ('62550000-0000-4000-8000-000000000010','mail-fixture6255.tuturuuu.com','active','cloudflare',now());
insert into private.mail_mailboxes(id,domain_id,address,type,status) values
 ('62550000-0000-4000-8000-000000000020','62550000-0000-4000-8000-000000000010','fixture6255-one@mail-fixture6255.tuturuuu.com','personal','active'),
 ('62550000-0000-4000-8000-000000000021','62550000-0000-4000-8000-000000000010','fixture6255-forward@mail-fixture6255.tuturuuu.com','shared','active');
insert into private.mail_mailbox_members(id,mailbox_id,user_id,role) values
 ('62550000-0000-4000-8000-000000000030','62550000-0000-4000-8000-000000000020','62550000-0000-4000-8000-000000000001','owner'),
 ('62550000-0000-4000-8000-000000000031','62550000-0000-4000-8000-000000000020','62550000-0000-4000-8000-000000000002','owner'),
 ('62550000-0000-4000-8000-000000000032','62550000-0000-4000-8000-000000000021','62550000-0000-4000-8000-000000000001','owner'),
 ('62550000-0000-4000-8000-000000000033','62550000-0000-4000-8000-000000000021','62550000-0000-4000-8000-000000000002','owner');
insert into private.mail_threads(id,mailbox_id,subject) values
 ('62550000-0000-4000-8000-000000000040','62550000-0000-4000-8000-000000000020','Synthetic Mail admission'),
 ('62550000-0000-4000-8000-000000000041','62550000-0000-4000-8000-000000000021','Synthetic forwarding');
insert into private.mail_labels(id,mailbox_id,name,slug,kind) values
 ('62550000-0000-4000-8000-000000000050','62550000-0000-4000-8000-000000000020','Inbox','inbox','system'),
 ('62550000-0000-4000-8000-000000000051','62550000-0000-4000-8000-000000000021','Inbox','inbox','system');

-- Exact deterministic seed IDs. Generated notification/batch/workspace IDs are
-- owned through these user FKs and disappear with the enclosing rollback.
create function pg_temp.fixture_id(n integer) returns uuid language sql immutable as $$
 select ('62550000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.deliver(n integer, raw_n integer, forward boolean default false, flags jsonb default '{}', label boolean default true)
returns uuid language plpgsql as $$
declare mid uuid := pg_temp.fixture_id(n); box uuid := pg_temp.fixture_id(case when forward then 21 else 20 end);
begin
 insert into private.mail_raw_messages(id,provider,provider_message_id,provider_payload)
 values(pg_temp.fixture_id(raw_n),'cloudflare','fixture6255-'||raw_n,
  jsonb_build_object('canonicalDomain','mail-fixture6255.tuturuuu.com','ingressDomain','mail-fixture6255.tuturuuu.com',
   'envelope',jsonb_build_object('to','fixture6255-one@mail-fixture6255.tuturuuu.com','observedTo','fixture6255-one@mail-fixture6255.tuturuuu.com')))
 on conflict(id) do nothing;
 insert into private.mail_messages(id,mailbox_id,thread_id,raw_message_id,provider,provider_message_id,
  direction,status,from_address,subject,ingress_domain_id,envelope_to,observed_recipient,metadata,created_at,received_at)
 values(mid,box,pg_temp.fixture_id(case when forward then 41 else 40 end),pg_temp.fixture_id(raw_n),'cloudflare','fixture6255-'||raw_n,
  'inbound','received','synthetic@example.invalid','Synthetic fixture',pg_temp.fixture_id(10),
  'fixture6255-one@mail-fixture6255.tuturuuu.com','fixture6255-one@mail-fixture6255.tuturuuu.com',flags,
  case when flags ? 'old' then now()-interval '1 day' else now() end,
  case when flags ? 'old' then now()-interval '1 day' else now() end);
 if label then insert into private.mail_message_labels(message_id,label_id) values(mid,pg_temp.fixture_id(case when forward then 51 else 50 end)); end if;
 return mid;
end;
$$;
create function pg_temp.owner_notifications(n integer default null) returns integer language sql as $$
 select count(*)::int from public.notifications where type='mail_received' and
 (case when n is null then user_id in (pg_temp.fixture_id(1),pg_temp.fixture_id(2)) else user_id=pg_temp.fixture_id(n) end)
$$;
create function pg_temp.first_notification() returns uuid language sql as $$
 select notification_id from private.mail_notification_receipts where message_id=pg_temp.fixture_id(100) and user_id=pg_temp.fixture_id(1)
$$;

select ok(private.mail_push_recipient_allowed(pg_temp.fixture_id(1),pg_temp.fixture_id(20)),'confirmed current persisted owner admitted');
select ok(private.mail_push_recipient_allowed(pg_temp.fixture_id(2),pg_temp.fixture_id(20)),'second owner independently admitted');
do $$begin perform pg_temp.deliver(100,200,false,'{}',false); end$$;
select ok(private.mail_inbound_push_message_allowed(pg_temp.fixture_id(100)),'expected persisted canonical ingress mapping is valid');
select is(pg_temp.owner_notifications(),0,'durable message alone does not alert before Inbox admission');
insert into private.mail_message_labels(message_id,label_id) values(pg_temp.fixture_id(100),pg_temp.fixture_id(50));
select is(pg_temp.owner_notifications(),2,'new Inbox event creates one notification per owner');
select is((select count(*)::int from private.mail_notification_receipts where message_id=pg_temp.fixture_id(100)),2,'two owners keep independent physical event receipts');
select is((select count(*)::int from private.notification_batches where user_id in (pg_temp.fixture_id(1),pg_temp.fixture_id(2)) and channel='push' and delivery_mode='immediate' and status='pending'),2,'real durable immediate push batches are queued');
select is((select count(*)::int from private.notification_delivery_log l join public.notifications n on n.id=l.notification_id where n.user_id in (pg_temp.fixture_id(1),pg_temp.fixture_id(2)) and l.channel='push' and l.status='pending'),2,'real delivery log references each notification');
select ok((select data->>'mailboxId'=pg_temp.fixture_id(20)::text and data->>'threadId'=pg_temp.fixture_id(40)::text and data->>'messageId'=pg_temp.fixture_id(100)::text and data->>'userId'=pg_temp.fixture_id(1)::text from public.notifications where id=pg_temp.first_notification()),'existing UUID tap contract is preserved');
select ok(private.can_deliver_mail_notification(pg_temp.first_notification()),'new unread notification passes actual delivery predicate');
delete from private.mail_message_labels where message_id=pg_temp.fixture_id(100) and label_id=pg_temp.fixture_id(50);
insert into private.mail_message_labels(message_id,label_id) values(pg_temp.fixture_id(100),pg_temp.fixture_id(50));
select is(pg_temp.owner_notifications(),2,'same persisted event replay cannot alert twice');
do $$begin perform pg_temp.deliver(101,200,true); end$$;
select is(pg_temp.owner_notifications(),2,'original and forwarded mailbox copies share physical event dedupe');

savepoint membership_case;
delete from private.mail_mailbox_members where id=pg_temp.fixture_id(30);
select ok(not private.can_deliver_mail_notification(pg_temp.first_notification()),'current revoked membership blocks delivery');
rollback to membership_case;
savepoint auth_case;
update auth.users set email_confirmed_at=null where id=pg_temp.fixture_id(1);
select ok(not private.mail_push_recipient_allowed(pg_temp.fixture_id(1),pg_temp.fixture_id(20)),'unconfirmed Auth is denied');
rollback to auth_case;
update auth.users set banned_until=now()+interval '1 day' where id=pg_temp.fixture_id(1);
select ok(not private.mail_push_recipient_allowed(pg_temp.fixture_id(1),pg_temp.fixture_id(20)),'current banned Auth is denied');
rollback to auth_case;
update auth.users set email='fixture6255-one@tuturuuu.com.evil.invalid' where id=pg_temp.fixture_id(1);
select ok(not private.mail_push_recipient_allowed(pg_temp.fixture_id(1),pg_temp.fixture_id(20)),'suffix lookalike Auth is denied');
rollback to auth_case;

insert into public.notification_preferences(id,user_id,scope,event_type,channel,enabled)
 values(pg_temp.fixture_id(60),pg_temp.fixture_id(1),'user','mail_received','push',false);
select ok(not private.can_deliver_mail_notification(pg_temp.first_notification()),'real saved Mail push preference blocks delivery');
do $$begin perform pg_temp.deliver(102,202); end$$;
select is(pg_temp.owner_notifications(1),1,'disabled owner does not receive a new alert');
update public.notification_preferences set enabled=true where id=pg_temp.fixture_id(60);
delete from private.mail_message_labels where message_id=pg_temp.fixture_id(102) and label_id=pg_temp.fixture_id(50);
insert into private.mail_message_labels(message_id,label_id) values(pg_temp.fixture_id(102),pg_temp.fixture_id(50));
select is(pg_temp.owner_notifications(1),1,'suppressed receipt prevents replay after preference reenable');
insert into private.mail_thread_user_state(thread_id,user_id,mailbox_id,muted_at)
 values(pg_temp.fixture_id(40),pg_temp.fixture_id(1),pg_temp.fixture_id(20),now());
select ok(not private.can_deliver_mail_notification(pg_temp.first_notification()),'real current thread mute blocks delivery');
update private.mail_thread_user_state set muted_at=null,snoozed_until=now()+interval '1 hour'
 where thread_id=pg_temp.fixture_id(40) and user_id=pg_temp.fixture_id(1);
do $$begin perform pg_temp.deliver(103,203); end$$;
select is(pg_temp.owner_notifications(1),1,'real snooze suppresses new admission');
savepoint history_case;
do $$begin perform pg_temp.deliver(104,204,false,'{"old":true}'); end$$;
select is(pg_temp.owner_notifications(),4,'historical event does not alert either owner');
do $$begin perform pg_temp.deliver(105,205,false,'{"import":true}'); end$$;
select is(pg_temp.owner_notifications(),4,'historical import metadata does not alert');
rollback to history_case;
savepoint ingress_case;
update private.mail_raw_messages set provider_payload='{"canonicalDomain":"evil.invalid"}' where id=pg_temp.fixture_id(200);
select ok(not private.mail_inbound_push_message_allowed(pg_temp.fixture_id(100)),'tampered persisted canonical mapping is denied');
rollback to ingress_case;
update private.mail_raw_messages set spam_verdict='FAIL' where id=pg_temp.fixture_id(200);
select ok(not private.mail_inbound_push_message_allowed(pg_temp.fixture_id(100)),'persisted spam failure is denied');
rollback to ingress_case;
-- Restore the exact owned thread state, never any other member's preferences.
update private.mail_thread_user_state set snoozed_until=null where thread_id=pg_temp.fixture_id(40) and user_id=pg_temp.fixture_id(1);
savepoint dismissal_case;
update public.notifications set read_at=now() where id=pg_temp.first_notification();
select ok(not private.can_deliver_mail_notification(pg_temp.first_notification()),'system notification read dismissal blocks send');
rollback to dismissal_case;
insert into private.mail_message_user_state(message_id,user_id,mailbox_id,read_at) values(pg_temp.fixture_id(100),pg_temp.fixture_id(1),pg_temp.fixture_id(20),now());
select ok(not private.can_deliver_mail_notification(pg_temp.first_notification()),'mail reader read state blocks send');
update private.mail_message_user_state set read_at=null,archived_at=now() where message_id=pg_temp.fixture_id(100) and user_id=pg_temp.fixture_id(1);
select ok(not private.can_deliver_mail_notification(pg_temp.first_notification()),'current archive state blocks send');
update private.mail_message_user_state set archived_at=null,trashed_at=now() where message_id=pg_temp.fixture_id(100) and user_id=pg_temp.fixture_id(1);
select ok(not private.can_deliver_mail_notification(pg_temp.first_notification()),'current trash state blocks send');
select throws_ok($$insert into private.mail_notification_receipts(message_id,user_id,event_key)
 values('62550000-0000-4000-8000-000000000101','62550000-0000-4000-8000-000000000001','raw:62550000-0000-4000-8000-000000000200')$$,
 '23505',null,'real partial unique index rejects a second physical event owner claim');
select * from finish();
rollback;
