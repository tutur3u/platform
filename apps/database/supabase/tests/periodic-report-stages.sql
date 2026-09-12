begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);
select is(private.periodic_report_stage('draft', 'PENDING', 'draft'), 'draft', 'draft/PENDING/draft stage');
select is(private.periodic_report_stage('ready', 'PENDING', 'draft'), 'pending', 'ready/PENDING/draft stage');
select is(private.periodic_report_stage('ready', 'APPROVED', 'draft'), 'approved', 'ready/APPROVED/draft stage');
select is(private.periodic_report_stage('ready', 'APPROVED', 'blocked'), 'blocked', 'ready/APPROVED/blocked stage');
select is(private.periodic_report_stage('ready', 'APPROVED', 'queued'), 'queued', 'ready/APPROVED/queued stage');
select is(private.periodic_report_stage('ready', 'APPROVED', 'processing'), 'processing', 'ready/APPROVED/processing stage');
select is(private.periodic_report_stage('ready', 'APPROVED', 'sent'), 'sent', 'ready/APPROVED/sent stage');
select is(private.periodic_report_stage('ready', 'APPROVED', 'failed'), 'failed', 'ready/APPROVED/failed stage');
select is(private.periodic_report_stage('draft', 'APPROVED', 'skipped'), 'skipped', 'draft/APPROVED/skipped stage');
select is(private.periodic_report_stage('ready', 'REJECTED', 'draft'), 'rejected', 'ready/REJECTED/draft stage');
select is(private.periodic_report_stage('draft', 'APPROVED', 'sent'), 'sent', 'draft/APPROVED/sent stage');
select is(private.periodic_report_stage('draft', 'REJECTED', 'cancelled'), 'rejected', 'draft/REJECTED/cancelled stage');
select is(private.periodic_report_stage('generating', 'PENDING', 'draft'), 'processing', 'generating/PENDING/draft stage');
select is(private.periodic_report_stage('failed', 'PENDING', 'draft'), 'failed', 'failed/PENDING/draft stage');
insert into public.users (id, display_name) values
('40000000-0000-4000-8000-000000009101', 'Report test owner');
insert into public.workspaces (id, name, creator_id, personal) values
('40000000-0000-4000-8000-000000009102', 'Report test workspace', '40000000-0000-4000-8000-000000009101', false);
insert into public.workspace_users (id, ws_id, display_name, email) values
('40000000-0000-4000-8000-000000009103', '40000000-0000-4000-8000-000000009102', 'Learner', 'Learner@Example.com');
insert into public.workspace_user_groups (id, ws_id, name) values
('40000000-0000-4000-8000-000000009104', '40000000-0000-4000-8000-000000009102', 'Test group');

insert into private.external_user_monthly_reports(id, user_id, group_id, title, content, feedback, generation_status, delivery_status, updated_at)
values ('40000000-0000-4000-8000-000000009105','40000000-0000-4000-8000-000000009103','40000000-0000-4000-8000-000000009104','Skipped','Content','Feedback','draft','skipped', now());
select is((select report_stage from private.external_user_monthly_reports_workspace_view where id='40000000-0000-4000-8000-000000009105'), 'skipped', 'view preserves skipped stage');
select is(private.get_periodic_report_stage_counts('40000000-0000-4000-8000-000000009102')->>'skipped', '1', 'exact stage aggregate includes skipped draft only once');
select is(private.get_periodic_report_stage_counts('40000000-0000-4000-8000-000000009102','monthly','{}'::uuid[]), '{}'::jsonb, 'empty group access returns no stages');
insert into public.workspace_configs(ws_id,id,value) values ('40000000-0000-4000-8000-000000009102','AUTO_SEND_APPROVED_REPORTS','true');
update private.external_user_monthly_reports set report_approval_status='PENDING',approved_at=null,approved_by=null where id='40000000-0000-4000-8000-000000009105';
update private.external_user_monthly_reports set report_approval_status='APPROVED',approved_at=now(),approved_by='40000000-0000-4000-8000-000000009103' where id='40000000-0000-4000-8000-000000009105';
select is((select count(*)::int from private.user_report_email_queue where report_id='40000000-0000-4000-8000-000000009105'),0,'skipped report is never auto-queued after approval');
select is((select report_stage from private.search_periodic_reports('40000000-0000-4000-8000-000000009102','monthly','Skipped') where id='40000000-0000-4000-8000-000000009105'), 'skipped', 'search retains the stage column');
select is(private.get_periodic_report_stage_counts('40000000-0000-4000-8000-000000009199'), '{}'::jsonb, 'other workspace counts are isolated');
select is(private.get_periodic_report_stage_counts('40000000-0000-4000-8000-000000009102','weekly'), '{}'::jsonb, 'cadence counts are isolated');
select is(private.get_periodic_report_stage_counts('40000000-0000-4000-8000-000000009102','monthly',null,'2026-09-01','2026-09-30'), '{}'::jsonb, 'dated count scope excludes undated reports');
select ok(not has_function_privilege('authenticated','private.get_periodic_report_stage_counts(uuid,text,uuid[],date,date)','EXECUTE'), 'stage counts require the authorized server path');

-- Scoped historical cleanup: strict GMT+7 boundary and delivery safeguards.
insert into public.workspaces(id,name,creator_id,personal) values ('42529372-c669-4833-bb32-2cab1f4ffd83','Easy Center cleanup test','40000000-0000-4000-8000-000000009101',false);
insert into public.workspace_users(id,ws_id,display_name,email) values ('40000000-0000-4000-8000-000000009201','42529372-c669-4833-bb32-2cab1f4ffd83','Cleanup learner','cleanup@example.com');
insert into public.workspace_user_groups(id,ws_id,name) values ('40000000-0000-4000-8000-000000009202','42529372-c669-4833-bb32-2cab1f4ffd83','Cleanup group');
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009210','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 0','Keep content','Keep feedback','weekly','draft','draft','2026-09-11 16:59:59+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009211','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 1','Keep content','Keep feedback','monthly','ready','draft','2026-09-11 16:59:59+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009212','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 2','Keep content','Keep feedback','quarterly','draft','draft','2026-09-11 16:59:59+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009213','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 3','Keep content','Keep feedback','yearly','ready','draft','2026-09-11 16:59:59+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009214','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 4','Keep content','Keep feedback','monthly','draft','draft','2026-09-11 17:00:00+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009215','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 5','Keep content','Keep feedback','monthly','ready','draft','2026-09-11 17:00:01+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009216','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 6','Keep content','Keep feedback','monthly','draft','sent','2026-09-11 16:59:59+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009217','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 7','Keep content','Keep feedback','monthly','ready','draft','2026-09-11 16:59:59+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009218','40000000-0000-4000-8000-000000009201','40000000-0000-4000-8000-000000009202','Cutoff 8','Keep content','Keep feedback','monthly','draft','draft','2026-09-11 16:59:59+00',now());
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,cadence,generation_status,delivery_status,created_at,updated_at) values ('40000000-0000-4000-8000-000000009219','40000000-0000-4000-8000-000000009103','40000000-0000-4000-8000-000000009104','Cutoff 9','Keep content','Keep feedback','monthly','ready','draft','2026-09-11 16:59:59+00',now());

insert into private.user_report_email_queue(report_id,ws_id,user_id,recipient_email,delivery_kind,status,sent_at) values
('40000000-0000-4000-8000-000000009217','42529372-c669-4833-bb32-2cab1f4ffd83','40000000-0000-4000-8000-000000009201','cleanup@example.com','send','queued',null),
('40000000-0000-4000-8000-000000009218','42529372-c669-4833-bb32-2cab1f4ffd83','40000000-0000-4000-8000-000000009201','cleanup@example.com','send','sent',now());
update private.external_user_monthly_reports set delivery_status='draft',delivered_at=null where id in ('40000000-0000-4000-8000-000000009217','40000000-0000-4000-8000-000000009218');
select is(private.skip_unsent_periodic_reports_before('42529372-c669-4833-bb32-2cab1f4ffd83', '2026-09-12 00:00:00+07'),4,'cleanup returns exact affected count');
select is((select count(*)::int from private.external_user_monthly_reports where user_id='40000000-0000-4000-8000-000000009201' and delivery_status='skipped'),4,'only eligible old Not sent reports skipped across all cadences');
select is((select delivery_status from private.external_user_monthly_reports where id='40000000-0000-4000-8000-000000009214'),'draft','exact midnight GMT+7 is excluded');
select is((select delivery_status from private.external_user_monthly_reports where id='40000000-0000-4000-8000-000000009215'),'draft','after cutoff is excluded');
select is((select delivery_status from private.external_user_monthly_reports where id='40000000-0000-4000-8000-000000009216'),'sent','sent delivery is preserved');
select is((select delivery_status from private.external_user_monthly_reports where id='40000000-0000-4000-8000-000000009217'),'draft','active queue is preserved');
select is((select delivery_status from private.external_user_monthly_reports where id='40000000-0000-4000-8000-000000009218'),'draft','accepted real delivery is preserved despite stale report state');
select is((select delivery_status from private.external_user_monthly_reports where id='40000000-0000-4000-8000-000000009219'),'draft','other workspace is excluded');
select is((select content from private.external_user_monthly_reports where id='40000000-0000-4000-8000-000000009210'),'Keep content','report content is preserved');
update private.external_user_monthly_reports set last_delivery_error='skip-audit-sentinel' where id='40000000-0000-4000-8000-000000009210';
select is(private.skip_unsent_periodic_reports_before('42529372-c669-4833-bb32-2cab1f4ffd83', '2026-09-12 00:00:00+07'),0,'repeated cleanup affects no reports');
select is((select last_delivery_error from private.external_user_monthly_reports where id='40000000-0000-4000-8000-000000009210'),'skip-audit-sentinel','cleanup is idempotent');
select ok(not has_function_privilege('authenticated','private.skip_unsent_periodic_reports_before(uuid,timestamptz)','EXECUTE'),'cleanup is restricted to server maintenance');
select * from finish();
rollback;
