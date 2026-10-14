begin;
set local search_path=public,extensions;
select no_plan();
select is((select count(*)::int from private.mail_notification_receipts),3,'migration retains every legacy decision');
select is((select count(*)::int from public.notifications),2,'migration never backfills historical alerts');
select is((select count(*)::int from private.mail_notification_receipts where event_key='raw:e0000000-0000-0000-0000-000000000005'),2,'one event claim per legacy owner, including suppressed owner');
select is((select count(*)::int from private.mail_notification_receipts where event_key is null),1,'duplicate legacy receipt survives with nullable key');
select is((select error_message from private.notification_batches where id='e0000000-0000-0000-0000-000000000009'),'delivery_outcome_unknown','unknown provider outcome never reset by migration');
select ok(private.can_deliver_mail_notification('e0000000-0000-0000-0000-000000000008'),'canonical legacy accepted receipt remains sendable');
select ok(not private.can_deliver_mail_notification('e0000000-0000-0000-0000-000000000011'),'duplicate legacy pending notification cannot send');
-- Remove only synthetic seed history so subsequent event counts are isolated.
delete from private.mail_notification_receipts;
delete from public.notifications;
delete from private.notification_batches;
delete from private.mail_messages;
delete from private.mail_threads;
delete from private.mail_mailbox_members;
delete from private.mail_raw_messages;
delete from private.mail_mailboxes;
delete from private.mail_domains;
delete from public.users;
delete from auth.users;
insert into private.mail_domains(id,domain,status,verified_at) values
('a0000000-0000-0000-0000-000000000001','tuturuuu.com','active',now()),
('a0000000-0000-0000-0000-000000000002','team.tuturuuu.com','active',now()),
('a0000000-0000-0000-0000-000000000003','unverified.tuturuuu.com','active',null),
('a0000000-0000-0000-0000-000000000004','tuturuuu.com.evil.test','active',now());
insert into auth.users(id,email,email_confirmed_at,banned_until) values
('b0000000-0000-0000-0000-000000000001','owner@tuturuuu.com',now(),null),
('b0000000-0000-0000-0000-000000000002','owner@team.tuturuuu.com',now(),null),
('b0000000-0000-0000-0000-000000000003','owner@tuturuuu.com.evil.test',now(),null),
('b0000000-0000-0000-0000-000000000004','unconfirmed@tuturuuu.com',null,null),
('b0000000-0000-0000-0000-000000000005','owner@unverified.tuturuuu.com',now(),null),
('b0000000-0000-0000-0000-000000000006','banned@tuturuuu.com',now(),now()+interval '1 day');
insert into public.users select id from auth.users;
insert into private.mail_mailboxes(id,domain_id,address) values
('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','owner@tuturuuu.com'),
('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','forward@tuturuuu.com');
insert into private.mail_mailbox_members select b.id,u.id from private.mail_mailboxes b cross join public.users u;
insert into private.mail_threads select gen_random_uuid(),id from private.mail_mailboxes;
insert into private.mail_labels select gen_random_uuid(),id,'inbox','system' from private.mail_mailboxes;
create function pg_temp.deliver(p_box uuid, p_raw uuid default null, p_flags jsonb default '{}', p_label boolean default true)
returns uuid language plpgsql as $$
declare message_id uuid;
begin
 if p_raw is not null then
  insert into private.mail_raw_messages(id,provider_message_id,provider_payload)
  select p_raw,'fixture-'||p_raw::text,jsonb_build_object('canonicalDomain',d.domain,'ingressDomain',d.domain,
    'envelope',jsonb_build_object('to',b.address,'observedTo',b.address))
  from private.mail_mailboxes b join private.mail_domains d on d.id=b.domain_id where b.id=p_box on conflict do nothing;
 end if;
 insert into private.mail_messages(mailbox_id,thread_id,raw_message_id,provider,metadata,created_at,received_at,provider_message_id,ingress_domain_id,envelope_to,observed_recipient)
 select p_box,t.id,p_raw,coalesce(p_flags->>'provider','cloudflare'),p_flags,
 case when p_flags ? 'old' then now()-interval '1 day' else now() end,
 case when p_flags ? 'old' then now()-interval '1 day' else now() end,
 'fixture-'||p_raw::text,b.domain_id,coalesce(r.provider_payload#>>'{envelope,to}',b.address),coalesce(r.provider_payload#>>'{envelope,observedTo}',b.address)
 from private.mail_threads t join private.mail_mailboxes b on b.id=t.mailbox_id left join private.mail_raw_messages r on r.id=p_raw where t.mailbox_id=p_box returning id into message_id;
 if p_label then insert into private.mail_message_labels select message_id,id from private.mail_labels where mailbox_id=p_box; end if;
 return message_id;
end;
$$;
create temporary table fixture_messages(label text primary key,id uuid);
insert into fixture_messages values('new',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','{}',false));
select is((select count(*)::int from public.notifications),0,'no notification before durable Inbox delivery');
insert into private.mail_message_labels select m.id,l.id from fixture_messages m cross join private.mail_labels l where m.label='new' and l.mailbox_id='c0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000001'),1,'apex current owner admitted');
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000002'),1,'verified genuine subdomain owner admitted');
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000003'),0,'suffix lookalike owner rejected');
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000004'),0,'unconfirmed current identity rejected');
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000005'),0,'unverified domain rejected despite valid suffix');
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000006'),0,'banned owner rejected');
select is((select count(*)::int from private.notification_delivery_log where channel='email'),0,'no email loop enqueued');
select is((select count(*)::int from public.fixture_http_events),2,'existing event dispatcher receives dedicated immediate batches');
select ok((select bool_and(data->>'userId'=user_id::text and ws_id is null and scope='user') from public.notifications),'payloads remain actor-bound and workspace independent');
select ok((select bool_and(private.can_deliver_mail_notification(id)) from public.notifications),'current unread member admitted at send time');
insert into private.mail_message_user_state(message_id,mailbox_id,user_id,read_at)
select id,'c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',now() from fixture_messages where label='new';
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where user_id='b0000000-0000-0000-0000-000000000001' limit 1),'Mail read state suppresses queued push without notification read');
update private.mail_message_user_state set read_at=null,archived_at=now();
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where user_id='b0000000-0000-0000-0000-000000000001' limit 1),'Mail archive state suppresses queued push');
update private.mail_message_user_state set archived_at=null,trashed_at=now();
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where user_id='b0000000-0000-0000-0000-000000000001' limit 1),'Mail trash state suppresses queued push');
delete from private.mail_message_user_state;
insert into fixture_messages values('forward',pg_temp.deliver('c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001'));
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000001'),1,'original and forwarded copy alert common owner once');
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000002'),1,'shared subdomain owner also deduplicated across copies');
delete from private.mail_message_labels where message_id=(select id from fixture_messages where label='new');
insert into private.mail_message_labels select m.id,l.id from fixture_messages m cross join private.mail_labels l where m.label='new' and l.mailbox_id='c0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000001'),1,'webhook/relabel replay cannot alert again');
update public.notifications set read_at=now() where user_id='b0000000-0000-0000-0000-000000000001';
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where user_id='b0000000-0000-0000-0000-000000000001' limit 1),'read notification cannot be sent later');
update private.mail_domains set status='disabled' where domain='team.tuturuuu.com';
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where user_id='b0000000-0000-0000-0000-000000000002' limit 1),'domain disable revokes queued subdomain push');
update private.mail_domains set status='active' where domain='team.tuturuuu.com';
delete from private.mail_mailbox_members where user_id='b0000000-0000-0000-0000-000000000002';
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where user_id='b0000000-0000-0000-0000-000000000002' limit 1),'membership revoke blocks pending send');
insert into private.mail_mailbox_members select id,'b0000000-0000-0000-0000-000000000002'::uuid from private.mail_mailboxes;
insert into fixture_messages values('history',pg_temp.deliver('c0000000-0000-0000-0000-000000000001',null,'{"old":true}'));
insert into fixture_messages values('import',pg_temp.deliver('c0000000-0000-0000-0000-000000000001',null,'{"import":true}'));
insert into fixture_messages values('takeout',pg_temp.deliver('c0000000-0000-0000-0000-000000000001',null,'{"provider":"google_takeout"}'));
select is((select count(*)::int from public.notifications where entity_id in(select id from fixture_messages where label in('history','import','takeout'))),0,'history and import paths never alert');
insert into public.fixture_notification_preferences values('b0000000-0000-0000-0000-000000000001','mail_received',false);
insert into fixture_messages values('optout',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002'));
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000001' and entity_id=(select id from fixture_messages where label='optout')),0,'Mail preference suppresses creation');
delete from public.fixture_notification_preferences;
insert into fixture_messages values('optoutforward',pg_temp.deliver('c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002'));
select is((select count(*)::int from public.notifications where user_id='b0000000-0000-0000-0000-000000000001' and entity_id=(select id from fixture_messages where label='optoutforward')),0,'preference suppression receipt survives forwarding/re-enable');
insert into fixture_messages values('distinct',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003'));
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='distinct')),2,'distinct physical message alerts each authorized owner');
select ok(not has_function_privilege('authenticated','private.can_deliver_mail_notification(uuid)','execute'),'private delivery authority not exposed to callers');
-- Boundary failures are tested before attaching the authoritative Inbox label.
create function pg_temp.admit_fixture(p_id uuid) returns void language sql as $$
 insert into private.mail_message_labels select m.id,l.id from private.mail_messages m
 join private.mail_labels l on l.mailbox_id=m.mailbox_id where m.id=p_id;
$$;
insert into fixture_messages values('tampered',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000004','{}',false));
update private.mail_raw_messages set provider_payload=jsonb_set(provider_payload,'{canonicalDomain}','"evil.test"') where id='d0000000-0000-0000-0000-000000000004';
select pg_temp.admit_fixture(id) from fixture_messages where label='tampered';
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='tampered')),0,'tampered canonical domain cannot enqueue');
insert into fixture_messages values('providerMismatch',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000005','{}',false));
update private.mail_messages set provider_message_id='other-event' where id=(select id from fixture_messages where label='providerMismatch');
select pg_temp.admit_fixture(id) from fixture_messages where label='providerMismatch';
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='providerMismatch')),0,'raw provider identity must bind to persisted message');
insert into fixture_messages values('spam',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000006','{}',false));
update private.mail_raw_messages set spam_verdict='FAIL' where id='d0000000-0000-0000-0000-000000000006';
select pg_temp.admit_fixture(id) from fixture_messages where label='spam';
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='spam')),0,'spam verdict suppresses incoming push');
insert into fixture_messages values('foreignLabel',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000007','{}',false));
insert into private.mail_message_labels select m.id,l.id from fixture_messages m cross join private.mail_labels l where m.label='foreignLabel' and l.mailbox_id='c0000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='foreignLabel')),0,'foreign mailbox Inbox label cannot authorize delivery');
insert into private.mail_thread_user_state(thread_id,user_id,mailbox_id,muted_at)
select id,'b0000000-0000-0000-0000-000000000001',mailbox_id,now() from private.mail_threads where mailbox_id='c0000000-0000-0000-0000-000000000001';
insert into fixture_messages values('muted',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000008'));
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='muted') and user_id='b0000000-0000-0000-0000-000000000001'),0,'muted owner suppressed independently');
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='muted') and user_id='b0000000-0000-0000-0000-000000000002'),1,'other mailbox owner retains notification');
update private.mail_thread_user_state set muted_at=null,snoozed_until=now()+interval '1 hour';
insert into fixture_messages values('snoozed',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000009'));
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='snoozed') and user_id='b0000000-0000-0000-0000-000000000001'),0,'snoozed owner suppressed');
delete from private.mail_thread_user_state;
insert into private.mail_domains(id,domain,status,verified_at,canonical_domain_id) values
('a0000000-0000-0000-0000-000000000007','inbound.tuturuuu.com','active',now(),'a0000000-0000-0000-0000-000000000001');
insert into fixture_messages values('alias',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000010','{}',false));
update private.mail_messages set ingress_domain_id='a0000000-0000-0000-0000-000000000007',observed_recipient='owner@inbound.tuturuuu.com' where id=(select id from fixture_messages where label='alias');
update private.mail_raw_messages set provider_payload=jsonb_set(jsonb_set(provider_payload,'{ingressDomain}','"inbound.tuturuuu.com"'),'{envelope,observedTo}','"owner@inbound.tuturuuu.com"') where id='d0000000-0000-0000-0000-000000000010';
select pg_temp.admit_fixture(id) from fixture_messages where label='alias';
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='alias')),2,'persisted canonical alias binds to actual destination owners');
update private.mail_domains set canonical_domain_id='a0000000-0000-0000-0000-000000000002' where domain='inbound.tuturuuu.com';
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where entity_id=(select id from fixture_messages where label='alias') limit 1),'alias rebinding revokes pending notification');
update private.mail_domains set inbound_provider='ses' where domain='tuturuuu.com';
insert into fixture_messages values('ses',pg_temp.deliver('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000011','{"provider":"ses"}',false));
update private.mail_raw_messages set provider='ses',provider_payload='{"receipt":{"recipients":["owner@tuturuuu.com"]}}' where id='d0000000-0000-0000-0000-000000000011';
select pg_temp.admit_fixture(id) from fixture_messages where label='ses';
select is((select count(*)::int from public.notifications where entity_id=(select id from fixture_messages where label='ses')),2,'verified SES persisted recipient binds to mailbox');
update private.mail_raw_messages set provider_payload='{"receipt":{"recipients":["foreign@tuturuuu.com"]}}' where id='d0000000-0000-0000-0000-000000000011';
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where entity_id=(select id from fixture_messages where label='ses') limit 1),'SES recipient tampering blocks pending send');
select * from finish();
rollback;
