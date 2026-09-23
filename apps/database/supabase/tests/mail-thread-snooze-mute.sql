begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);
insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
('a1230000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'push-test@tuturuuu.com', now(), now(), now()),
('a1230000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'other-push-test@tuturuuu.com', now(), now(), now());
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

insert into private.mail_message_user_state(message_id, mailbox_id, user_id, archived_at) values ('e1230000-0000-0000-0000-000000000001', 'b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001', now());
select lives_ok($$select private.set_mail_thread_preference('b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001', array['c1230000-0000-0000-0000-000000000001']::uuid[], 'snooze', now() + interval '1 hour')$$, 'member can snooze own thread');
select ok((select archived_at is null from private.mail_message_user_state where message_id = 'e1230000-0000-0000-0000-000000000001' and user_id = 'a1230000-0000-0000-0000-000000000001'), 'snoozing archived mail restores own Inbox eligibility');
select ok(not private.mail_thread_push_allowed('e1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001'), 'snooze suppresses own push');
select ok(private.mail_thread_push_allowed('e1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000002'), 'another member remains unaffected');
update private.mail_thread_user_state set snoozed_until = now() - interval '1 minute';
select ok(private.mail_thread_push_allowed('e1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001'), 'expired snooze allows future notifications');
select private.set_mail_thread_preference('b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001', array['c1230000-0000-0000-0000-000000000001']::uuid[], 'mute');
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000001', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001' and user_id = 'a1230000-0000-0000-0000-000000000001'), 0, 'muted member gets no incoming notification');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001' and user_id = 'a1230000-0000-0000-0000-000000000002'), 1, 'unmuted shared-mailbox member still notified');
select ok((select private.can_deliver_mail_notification(id) from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001' and user_id = 'a1230000-0000-0000-0000-000000000002'), 'queued notification initially deliverable');
select private.set_mail_thread_preference('b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000002', array['c1230000-0000-0000-0000-000000000001']::uuid[], 'mute');
select ok((select not private.can_deliver_mail_notification(id) from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001' and user_id = 'a1230000-0000-0000-0000-000000000002'), 'mute rechecked before queued notification delivery');
select private.set_mail_thread_preference('b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001', array['c1230000-0000-0000-0000-000000000001']::uuid[], 'unsnooze');
select ok(not private.mail_thread_push_allowed('e1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001'), 'unsnooze preserves independent mute');
select private.set_mail_thread_preference('b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001', array['c1230000-0000-0000-0000-000000000001']::uuid[], 'unmute');
select ok(private.mail_thread_push_allowed('e1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001'), 'unmute restores future push eligibility');
delete from private.mail_message_labels where message_id = 'e1230000-0000-0000-0000-000000000001';
insert into private.mail_message_labels(message_id, label_id) values ('e1230000-0000-0000-0000-000000000001', 'd1230000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications where entity_id = 'e1230000-0000-0000-0000-000000000001' and user_id = 'a1230000-0000-0000-0000-000000000001'), 0, 'unmuting does not replay muted messages');
select throws_ok($$select private.set_mail_thread_preference('b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001', array['c1230000-0000-0000-0000-000000000009']::uuid[], 'mute')$$, 'P0001', 'Mailbox access denied', 'foreign thread id rejected atomically');
select throws_ok($$select private.set_mail_thread_preference('b1230000-0000-0000-0000-000000000001', 'a1230000-0000-0000-0000-000000000001', array['c1230000-0000-0000-0000-000000000001']::uuid[], 'snooze', now() - interval '1 hour')$$, 'P0001', 'Snooze must end within one year', 'past deadline rejected');
select ok(not has_function_privilege('authenticated', 'private.set_mail_thread_preference(uuid,uuid,uuid[],text,timestamptz)', 'EXECUTE'), 'only service role can invoke verified actor mutation');
select ok(to_regprocedure('public.account_required_mfa_satisfied()') is null or exists (select 1 from pg_policies where schemaname = 'private' and tablename = 'mail_thread_user_state' and policyname = 'account_required_mfa' and permissive = 'RESTRICTIVE'), 'new table preserves installed MFA policy');
select * from finish();
rollback;
