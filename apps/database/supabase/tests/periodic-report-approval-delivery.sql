begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

insert into public.users (id, display_name) values
('40000000-0000-4000-8000-000000009101', 'Report test owner');
insert into public.workspaces (id, name, creator_id, personal) values
('40000000-0000-4000-8000-000000009102', 'Report test workspace', '40000000-0000-4000-8000-000000009101', false);
insert into public.workspace_users (id, ws_id, display_name, email) values
('40000000-0000-4000-8000-000000009103', '40000000-0000-4000-8000-000000009102', 'Learner', 'Learner@Example.com');
insert into public.workspace_user_groups (id, ws_id, name) values
('40000000-0000-4000-8000-000000009104', '40000000-0000-4000-8000-000000009102', 'Test group');
insert into private.external_user_monthly_reports (id, user_id, group_id, title, content, feedback, report_approval_status, updated_at) values
('40000000-0000-4000-8000-000000009105', '40000000-0000-4000-8000-000000009103', '40000000-0000-4000-8000-000000009104', 'Monthly', 'Progress', 'Practice', 'PENDING', now());

update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now(), rejected_by = null, rejected_at = null, rejection_reason = null
where id = '40000000-0000-4000-8000-000000009105';
select is((select count(*)::int from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), 0, 'auto-send defaults off');
insert into public.workspace_configs (ws_id, id, value) values
('40000000-0000-4000-8000-000000009102', 'AUTO_SEND_APPROVED_REPORTS', 'true');
select is((select count(*)::int from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), 0, 'enabling does not backfill');
update private.external_user_monthly_reports set report_approval_status = 'PENDING', approved_by = null, approved_at = null, rejected_by = null, rejected_at = null, rejection_reason = null
where id = '40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now(), rejected_by = null, rejected_at = null, rejection_reason = null
where id = '40000000-0000-4000-8000-000000009105';
select is((select recipient_email from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), 'learner@example.com', 'approval queues the normalized profile email');
select is((select delivery_status from private.external_user_monthly_reports where id = '40000000-0000-4000-8000-000000009105'), 'queued', 'report and queue state agree');
update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now(), rejected_by = null, rejected_at = null, rejection_reason = null
where id = '40000000-0000-4000-8000-000000009105';
select is((select count(*)::int from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), 1, 'repeated approval does not duplicate the queue');
update private.external_user_monthly_reports set report_approval_status = 'REJECTED', rejection_reason = 'Revise', rejected_by = '40000000-0000-4000-8000-000000009103', rejected_at = now(), approved_by = null, approved_at = null
where id = '40000000-0000-4000-8000-000000009105';
select is((select status from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), 'cancelled', 'revoking approval cancels a waiting delivery');
update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now(), rejected_by = null, rejected_at = null, rejection_reason = null
where id = '40000000-0000-4000-8000-000000009105';
select is((select status from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), 'queued', 'reapproval restarts a cancelled delivery');

-- A completed test may become a real delivery; old test metadata must disappear.
update private.user_report_email_queue set status = 'sent', delivery_kind = 'test', sent_at = now(), provider_message_id = 'test-message' where report_id = '40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set report_approval_status = 'PENDING', approved_by = null, approved_at = null where id = '40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now() where id = '40000000-0000-4000-8000-000000009105';
select is((select sent_at from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), null::timestamptz, 'real delivery clears the test timestamp');
select is((select provider_message_id from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), null::text, 'real delivery clears the test provider id');

-- Queue lifecycle changes update report state in the same transaction.
update private.user_report_email_queue set status = 'processing' where report_id = '40000000-0000-4000-8000-000000009105';
select is((private.request_periodic_report_delivery('40000000-0000-4000-8000-000000009105', '40000000-0000-4000-8000-000000009102', 'retry')->>'code')::int, 409, 'request cannot overwrite a processing queue row');
with retried as (
 update private.user_report_email_queue set status = 'queued'
 where report_id = '40000000-0000-4000-8000-000000009105' and (status in ('failed','blocked','cancelled') or (status = 'sent' and delivery_kind = 'test')) returning id
) select is((select count(*)::int from retried), 0, 'manual retry cannot overwrite an existing processing queue row');
update private.user_report_email_queue set status = 'failed' where report_id = '40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set report_approval_status = 'PENDING', approved_by = null, approved_at = null where id = '40000000-0000-4000-8000-000000009105';
select is((private.request_periodic_report_delivery('40000000-0000-4000-8000-000000009105', '40000000-0000-4000-8000-000000009102', 'retry')->>'code')::int, 409, 'revocation wins over a stale queue request');
select is((select delivery_status from private.external_user_monthly_reports where id = '40000000-0000-4000-8000-000000009105'), 'cancelled', 'rejected stale request leaves report cancelled');
update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now() where id = '40000000-0000-4000-8000-000000009105';

-- Even if report tracking loses its timestamp, the provider acceptance marker
-- on the blocked queue prevents automatic redelivery after approval changes.
update private.user_report_email_queue set status = 'blocked', sent_at = now(), provider_message_id = 'accepted-message', last_error = 'Provider accepted; tracking failed' where report_id = '40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set delivered_at = null, report_approval_status = 'PENDING', approved_by = null, approved_at = null where id = '40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now() where id = '40000000-0000-4000-8000-000000009105';
select is((select status from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), 'blocked', 'reapproval never requeues a provider-accepted blocked send');
select is((private.request_periodic_report_delivery('40000000-0000-4000-8000-000000009105', '40000000-0000-4000-8000-000000009102', 'retry')->>'code')::int, 409, 'manual retry also preserves accepted delivery');
update private.external_user_monthly_reports set delivered_at = now(), delivery_status = 'sent'
where id = '40000000-0000-4000-8000-000000009105';
update private.user_report_email_queue set status = 'sent' where report_id = '40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set report_approval_status = 'PENDING', approved_by = null, approved_at = null, rejected_by = null, rejected_at = null, rejection_reason = null
where id = '40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now(), rejected_by = null, rejected_at = null, rejection_reason = null
where id = '40000000-0000-4000-8000-000000009105';
select is((select status from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009105'), 'sent', 'reapproval never automatically resends a delivered report');
update public.workspace_users set email = null where id = '40000000-0000-4000-8000-000000009103';
insert into private.external_user_monthly_reports (id, user_id, group_id, title, content, feedback, report_approval_status, updated_at) values
('40000000-0000-4000-8000-000000009106', '40000000-0000-4000-8000-000000009103', '40000000-0000-4000-8000-000000009104', 'Missing email', 'Progress', 'Practice', 'PENDING', now());
update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_by = '40000000-0000-4000-8000-000000009103', approved_at = now() where id = '40000000-0000-4000-8000-000000009106';
select is((select delivery_status from private.external_user_monthly_reports where id = '40000000-0000-4000-8000-000000009106'), 'blocked', 'missing email is visibly blocked');
select is((select count(*)::int from private.user_report_email_queue where report_id = '40000000-0000-4000-8000-000000009106'), 0, 'missing email never enters the queue');

select ok(not has_function_privilege('authenticated', 'private.request_periodic_report_delivery(uuid,uuid,text)', 'execute'), 'direct authenticated RPC calls are forbidden');
select ok(has_function_privilege('service_role', 'private.request_periodic_report_delivery(uuid,uuid,text)', 'execute'), 'authorized server can request delivery');
select is((private.request_periodic_report_delivery('40000000-0000-4000-8000-000000009105', '40000000-0000-4000-8000-000000000000', 'send')->>'code')::int, 404, 'manual requests enforce workspace scope');
update public.workspace_users set email = 'restored@example.com' where id = '40000000-0000-4000-8000-000000009103';
select is((private.request_periodic_report_delivery('40000000-0000-4000-8000-000000009106', '40000000-0000-4000-8000-000000009102', 'send')->>'code')::int, 200, 'manual request queues a restored recipient');
select is((select delivery_status from private.external_user_monthly_reports where id = '40000000-0000-4000-8000-000000009106'), 'queued', 'manual queue and report update atomically');
select is((private.request_periodic_report_delivery('40000000-0000-4000-8000-000000009106', '40000000-0000-4000-8000-000000009102', 'cancel')->>'code')::int, 200, 'manual cancellation succeeds');
select is((select delivery_status from private.external_user_monthly_reports where id = '40000000-0000-4000-8000-000000009106'), 'cancelled', 'manual cancellation updates the report');
select * from finish();
rollback;
