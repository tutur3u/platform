-- Pre-migration history includes two accepted copies and a suppressed owner.
insert into private.mail_domains(id,domain,status,verified_at) values
('e0000000-0000-0000-0000-000000000001','tuturuuu.com','active',now());
insert into auth.users(id,email,email_confirmed_at) values
('e0000000-0000-0000-0000-000000000002','legacy@tuturuuu.com',now()),
('e0000000-0000-0000-0000-000000000003','suppressed@tuturuuu.com',now());
insert into public.users select id from auth.users;
insert into private.mail_mailboxes(id,domain_id,address) values
('e0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000001','legacy@tuturuuu.com');
insert into private.mail_mailbox_members(mailbox_id,user_id)
select 'e0000000-0000-0000-0000-000000000004',id from public.users;
insert into private.mail_threads(id,mailbox_id) values('e0000000-0000-0000-0000-000000000010','e0000000-0000-0000-0000-000000000004');
insert into private.mail_raw_messages(id,provider_message_id,provider_payload) values
('e0000000-0000-0000-0000-000000000005','legacy-event','{"canonicalDomain":"tuturuuu.com","ingressDomain":"tuturuuu.com","envelope":{"to":"legacy@tuturuuu.com"}}');
insert into private.mail_messages(id,mailbox_id,raw_message_id,created_at) values
('e0000000-0000-0000-0000-000000000006','e0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000005',now()-interval '2 days'),
('e0000000-0000-0000-0000-000000000007','e0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000005',now()-interval '1 day');
update private.mail_messages set thread_id='e0000000-0000-0000-0000-000000000010',provider_message_id='legacy-event',
 ingress_domain_id='e0000000-0000-0000-0000-000000000001',envelope_to='legacy@tuturuuu.com',observed_recipient='legacy@tuturuuu.com';
insert into public.notifications(id,user_id,type,scope,entity_type,entity_id,data)
select case when m.id='e0000000-0000-0000-0000-000000000006' then 'e0000000-0000-0000-0000-000000000008'::uuid else 'e0000000-0000-0000-0000-000000000011'::uuid end,
 'e0000000-0000-0000-0000-000000000002','mail_received','user','mail_message',m.id,
 jsonb_build_object('mailboxId',m.mailbox_id,'threadId',m.thread_id,'messageId',m.id,'userId','e0000000-0000-0000-0000-000000000002')
from private.mail_messages m;
insert into private.mail_notification_receipts(message_id,user_id,notification_id) values
('e0000000-0000-0000-0000-000000000006','e0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000008'),
('e0000000-0000-0000-0000-000000000007','e0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000011'),
('e0000000-0000-0000-0000-000000000006','e0000000-0000-0000-0000-000000000003',null);
insert into private.notification_batches(id,status,error_message,delivery_mode) values
('e0000000-0000-0000-0000-000000000009','failed','delivery_outcome_unknown',null);
