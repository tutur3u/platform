begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
('a1230000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'push-test@tuturuuu.com', now(), now(), now()),
('a1230000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'push-test@example.com', now(), now(), now());
insert into public.users(id) values ('a1230000-0000-0000-0000-000000000001'), ('a1230000-0000-0000-0000-000000000002') on conflict do nothing;
insert into private.mail_mailboxes(id, address, domain_id) select 'b1230000-0000-0000-0000-000000000001', 'push-test@tuturuuu.com', id from private.mail_domains where domain = 'tuturuuu.com';
insert into private.mail_mailbox_members(mailbox_id, user_id)
select 'b1230000-0000-0000-0000-000000000001', id from public.users where id in ('a1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000002');
insert into private.mail_threads(id, mailbox_id, subject, normalized_subject)
values ('c1230000-0000-0000-0000-000000000001', 'b1230000-0000-0000-0000-000000000001', 'Hello', 'hello');
insert into private.mail_labels(id, mailbox_id, name, slug, kind)
values ('d1230000-0000-0000-0000-000000000001', 'b1230000-0000-0000-0000-000000000001', 'Inbox', 'inbox', 'system');
insert into private.mail_messages(id, mailbox_id, thread_id, direction, provider, from_address, subject, received_at)
values ('e1230000-0000-0000-0000-000000000001', 'b1230000-0000-0000-0000-000000000001', 'c1230000-0000-0000-0000-000000000001', 'inbound', 'ses', 'sender@example.com', 'Hello', now());
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001'), 0, 'no push before Inbox delivery is persisted');
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000001', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001'), 1, 'only internal mailbox member receives notification');
select ok((select ws_id is null and scope = 'user' and data->>'userId' = user_id::text and data->>'mailboxId' = 'b1230000-0000-0000-0000-000000000001' from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001'), 'personal payload carries authorized mailbox and recipient');
select is((select count(*)::int from private.notification_delivery_log l join public.notifications n on n.id = l.notification_id where n.entity_id = 'e1230000-0000-0000-0000-000000000001' and l.channel = 'email'), 0, 'Mail never generates notification email loops');
select ok((select private.can_deliver_mail_notification(id) from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001'), 'current recipient can receive push');
update private.notification_batches set status = 'failed' where id in (
  select l.batch_id from private.notification_delivery_log l join public.notifications n on n.id = l.notification_id where n.entity_id = 'e1230000-0000-0000-0000-000000000001');
update private.notification_delivery_log set status = 'failed', retry_count = 1 where notification_id in (select id from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001');
select is(private.requeue_mail_push_batches(), 1, 'failed Mail batch recovered');
select is((select l.status from private.notification_delivery_log l join public.notifications n on n.id = l.notification_id where n.entity_id = 'e1230000-0000-0000-0000-000000000001'), 'pending', 'failed Mail delivery log made pending');
update private.notification_batches set status = 'failed' where id in (
  select l.batch_id from private.notification_delivery_log l join public.notifications n on n.id = l.notification_id where n.entity_id = 'e1230000-0000-0000-0000-000000000001');
update private.notification_delivery_log set status = 'failed', retry_count = 3 where notification_id in (select id from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001');
select is(private.requeue_mail_push_batches(), 0, 'exhausted Mail attempts remain failed');
create temporary table recovery_batch as
select l.batch_id as id from private.notification_delivery_log l join public.notifications n on n.id = l.notification_id
where n.entity_id = 'e1230000-0000-0000-0000-000000000001';
-- Override the timestamp trigger only within this rolled-back fixture.
alter table private.notification_batches disable trigger update_notification_batches_updated_at;
update private.notification_batches set status = 'processing', error_message = null, updated_at = now() - interval '11 minutes'
where id in (select id from recovery_batch);
select is(private.requeue_mail_push_batches(), 0, 'exhausted interrupted attempt is not replayed');
select is((select status from private.notification_batches where id in (select id from recovery_batch)), 'failed', 'exhausted processing batch reaches terminal state');
update private.notification_batches set status = 'processing', error_message = 'delivery_in_flight', updated_at = now() - interval '11 minutes'
where id in (select id from recovery_batch);
update private.notification_delivery_log set retry_count = 0 where batch_id in (select id from recovery_batch);
select is(private.requeue_mail_push_batches(), 0, 'ambiguous provider outcome is never automatically replayed');
select is((select error_message from private.notification_batches where id in (select id from recovery_batch)), 'delivery_outcome_unknown', 'ambiguous delivery is flagged for reconciliation');
update private.notification_batches set status = 'processing', channel = 'email', ws_id = '00000000-0000-0000-0000-000000000000', error_message = null, updated_at = now() - interval '11 minutes'
where id in (select id from recovery_batch);
select is(private.requeue_mail_push_batches(), 1, 'stale root email batches recover before provider submission');
select is((select status from private.notification_batches where id in (select id from recovery_batch)), 'pending', 'email recovery leaves a runnable batch');
alter table private.notification_batches enable trigger update_notification_batches_updated_at;
delete from private.mail_mailbox_members where user_id = 'a1230000-0000-0000-0000-000000000001';
select ok(not (select private.can_deliver_mail_notification(id) from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001'), 'revoked member cannot receive queued push');
insert into private.mail_mailbox_members(mailbox_id, user_id) values ('b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001');
delete from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001';
delete from private.mail_message_labels where message_id = 'e1230000-0000-0000-0000-000000000001';
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000001', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001'), 0, 'replay after notification deletion cannot push again');
insert into private.mail_messages(id, mailbox_id, thread_id, direction, provider, from_address, subject, received_at)
select 'e1230000-0000-0000-0000-000000000002', mailbox_id, thread_id, direction, 'google_takeout', from_address, subject, now() from private.mail_messages where id = 'e1230000-0000-0000-0000-000000000001';
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000002', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000002'), 0, 'historical import does not push');
insert into public.notification_preferences(user_id, event_type, channel, enabled, scope) values ('a1230000-0000-0000-0000-000000000001', 'mail_received', 'push', false, 'user');
insert into private.mail_messages(id, mailbox_id, thread_id, direction, provider, from_address, subject, received_at)
select 'e1230000-0000-0000-0000-000000000003', mailbox_id, thread_id, direction, provider, from_address, subject, now() from private.mail_messages where id = 'e1230000-0000-0000-0000-000000000001';
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000003', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000003'), 0, 'disabled push preference honored');
update public.notification_preferences set event_type = 'push_notifications'
where user_id = 'a1230000-0000-0000-0000-000000000001' and event_type = 'mail_received';
insert into private.mail_messages(id, mailbox_id, thread_id, direction, provider, from_address, subject, received_at)
select 'e1230000-0000-0000-0000-000000000004', mailbox_id, thread_id, direction, provider, from_address, subject, now() from private.mail_messages where id = 'e1230000-0000-0000-0000-000000000001';
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000004', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000004'), 0, 'general account push switch honored');
delete from public.notification_preferences where user_id = 'a1230000-0000-0000-0000-000000000001';
insert into private.mail_messages(id, mailbox_id, thread_id, direction, provider, from_address, subject, received_at, created_at)
select 'e1230000-0000-0000-0000-000000000005', mailbox_id, thread_id, direction, provider, from_address, subject, now() - interval '1 hour', now() - interval '1 hour' from private.mail_messages where id = 'e1230000-0000-0000-0000-000000000001';
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000005', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000005'), 0, 'restoring historical Inbox message does not push');
insert into private.mail_raw_messages(id, provider_message_id, spam_verdict) values ('f1230000-0000-0000-0000-000000000001', 'spam-fixture', 'FAIL');
insert into private.mail_messages(id, mailbox_id, thread_id, direction, provider, from_address, subject, received_at, raw_message_id)
select 'e1230000-0000-0000-0000-000000000006', mailbox_id, thread_id, direction, provider, from_address, subject, now(), 'f1230000-0000-0000-0000-000000000001' from private.mail_messages where id = 'e1230000-0000-0000-0000-000000000001';
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000006', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000006'), 0, 'spam verdict prevents push');
-- Forwarded copies must use destination membership, not source membership.
update auth.users set email = 'forward-test@tuturuuu.com' where id = 'a1230000-0000-0000-0000-000000000002';
insert into private.mail_mailboxes(id, address, domain_id, type)
select 'b1230000-0000-0000-0000-000000000002', 'forward-test@tuturuuu.com', id, 'shared' from private.mail_domains where domain = 'tuturuuu.com';
insert into private.mail_mailbox_members(mailbox_id, user_id) values ('b1230000-0000-0000-0000-000000000002', 'a1230000-0000-0000-0000-000000000002');
insert into private.mail_threads(id, mailbox_id, subject, normalized_subject) values ('c1230000-0000-0000-0000-000000000002', 'b1230000-0000-0000-0000-000000000002', 'Forwarded', 'forwarded');
insert into private.mail_labels(id, mailbox_id, name, slug, kind) values ('d1230000-0000-0000-0000-000000000002', 'b1230000-0000-0000-0000-000000000002', 'Inbox', 'inbox', 'system');
insert into private.mail_messages(id, mailbox_id, thread_id, direction, provider, from_address, subject, received_at)
values ('e1230000-0000-0000-0000-000000000007', 'b1230000-0000-0000-0000-000000000002', 'c1230000-0000-0000-0000-000000000002', 'inbound', 'cloudflare', 'sender@example.com', 'Forwarded', now());
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000007', 'd1230000-0000-0000-0000-000000000002');
select is((select user_id::text from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000007'), 'a1230000-0000-0000-0000-000000000002', 'forwarded copy goes only to destination member');
select ok((select private.can_deliver_mail_notification(id) from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000007'), 'forwarded destination authorized at send time');
select ok(not has_function_privilege('authenticated', 'private.can_deliver_mail_notification(uuid)', 'EXECUTE'), 'authenticated cannot probe private mail');
select ok(has_function_privilege('service_role', 'private.can_deliver_mail_notification(uuid)', 'EXECUTE'), 'service role can verify delivery');
select * from finish();
rollback;
