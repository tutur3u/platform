begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into public.users(id,display_name) values('81000000-0000-4000-8000-000000000001','Synthetic owner');
insert into public.workspaces(id,name,creator_id,personal) values('81000000-0000-4000-8000-000000000002','Synthetic outcomes workspace','81000000-0000-4000-8000-000000000001',false);
insert into public.workspace_users(id,ws_id,display_name,email) values('81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000002','Synthetic report subject','synthetic@example.com');
insert into public.workspace_user_groups(id,ws_id,name) values('81000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000002','Synthetic group');
insert into public.workspace_configs(ws_id,id,value) values('81000000-0000-4000-8000-000000000002','AUTO_SEND_APPROVED_REPORTS','true');
create temporary table delivery_snapshot(queue jsonb,report jsonb) on commit drop;
select ok(private.periodic_report_delivery_contract_ready(),'installed contract reports readiness without queue data');
select ok(not has_function_privilege('anon','private.periodic_report_delivery_contract_ready()','EXECUTE'),'anonymous readiness denied');
select ok(not has_function_privilege('authenticated','private.periodic_report_delivery_contract_ready()','EXECUTE'),'browser readiness denied');
select ok(has_function_privilege('service_role','private.periodic_report_delivery_contract_ready()','EXECUTE'),'service-only readiness permitted');
select ok(not has_function_privilege('authenticated','private.request_periodic_report_delivery(uuid,uuid,text,boolean)','EXECUTE'),'request service boundary retained');

-- Both historical and provider uncertainty survive every implicit requeue path.
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,report_approval_status,updated_at)
 values('81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000004','Synthetic historical uncertainty','Synthetic progress','','PENDING',now());
update private.external_user_monthly_reports set report_approval_status='APPROVED',approved_by='81000000-0000-4000-8000-000000000003',approved_at=now() where id='81000000-0000-4000-8000-000000000005';
update private.user_report_email_queue set status='blocked',last_error='Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.',attempt_count=2 where report_id='81000000-0000-4000-8000-000000000005';
update private.external_user_monthly_reports set delivery_status='blocked',last_delivery_error='Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.' where id='81000000-0000-4000-8000-000000000005';
update private.external_user_monthly_reports set report_approval_status='PENDING',approved_by=null,approved_at=null where id='81000000-0000-4000-8000-000000000005';
update private.external_user_monthly_reports set report_approval_status='APPROVED',approved_by='81000000-0000-4000-8000-000000000003',approved_at=now() where id='81000000-0000-4000-8000-000000000005';
select is((select status from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000005'),'blocked','reapproval leaves unknown queue blocked');
select is((select last_error from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000005'),'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.','reapproval preserves exact uncertainty marker');
select is((select attempt_count from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000005'),2,'reapproval preserves attempt history');
truncate delivery_snapshot;
insert into delivery_snapshot select to_jsonb(q),to_jsonb(r) from private.user_report_email_queue q join private.external_user_monthly_reports r on r.id=q.report_id where r.id='81000000-0000-4000-8000-000000000005';
select is((private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000002','send',true)->>'code')::integer,409,'Send cannot implicitly clear uncertainty');
select is((private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000002','test',true)->>'code')::integer,409,'Test cannot implicitly clear uncertainty');
select is((select to_jsonb(q) from private.user_report_email_queue q where report_id='81000000-0000-4000-8000-000000000005'),(select queue from delivery_snapshot),'Send/Test leave complete queue snapshot unchanged');
select is((select to_jsonb(r) from private.external_user_monthly_reports r where id='81000000-0000-4000-8000-000000000005'),(select report from delivery_snapshot),'Send/Test leave complete report snapshot unchanged');
select is((private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000002','retry',false)->>'code')::integer,409,'disabled gate still denies explicit Retry');
select is((select last_error from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000005'),'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.','disabled gate preserves queue uncertainty');
select is((select last_delivery_error from private.external_user_monthly_reports where id='81000000-0000-4000-8000-000000000005'),'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.','disabled gate preserves report uncertainty');
select is((select count(*)::integer from private.claim_periodic_report_emails('synthetic-worker')),0,'unknown blocked delivery is never claimed automatically');
select is((private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000002','retry',true)->>'code')::integer,200,'explicit operator Retry remains intentional');
select is((select status from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000005'),'queued','explicit Retry makes delivery claimable');
select is((select last_error from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000005'),null::text,'explicit Retry resets marker only after operator action');
-- Finish this synthetic case so it cannot be claimed by the next case.
select private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000002','cancel',true);

-- Both historical and provider uncertainty survive every implicit requeue path.
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,report_approval_status,updated_at)
 values('81000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000004','Synthetic provider uncertainty','Synthetic progress','','PENDING',now());
update private.external_user_monthly_reports set report_approval_status='APPROVED',approved_by='81000000-0000-4000-8000-000000000003',approved_at=now() where id='81000000-0000-4000-8000-000000000006';
update private.user_report_email_queue set status='blocked',last_error='Email delivery outcome is unknown. Check provider logs before retrying.',attempt_count=2 where report_id='81000000-0000-4000-8000-000000000006';
update private.external_user_monthly_reports set delivery_status='blocked',last_delivery_error='Email delivery outcome is unknown. Check provider logs before retrying.' where id='81000000-0000-4000-8000-000000000006';
update private.external_user_monthly_reports set report_approval_status='PENDING',approved_by=null,approved_at=null where id='81000000-0000-4000-8000-000000000006';
update private.external_user_monthly_reports set report_approval_status='APPROVED',approved_by='81000000-0000-4000-8000-000000000003',approved_at=now() where id='81000000-0000-4000-8000-000000000006';
select is((select status from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000006'),'blocked','reapproval leaves unknown queue blocked');
select is((select last_error from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000006'),'Email delivery outcome is unknown. Check provider logs before retrying.','reapproval preserves exact uncertainty marker');
select is((select attempt_count from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000006'),2,'reapproval preserves attempt history');
truncate delivery_snapshot;
insert into delivery_snapshot select to_jsonb(q),to_jsonb(r) from private.user_report_email_queue q join private.external_user_monthly_reports r on r.id=q.report_id where r.id='81000000-0000-4000-8000-000000000006';
select is((private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000002','send',true)->>'code')::integer,409,'Send cannot implicitly clear uncertainty');
select is((private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000002','test',true)->>'code')::integer,409,'Test cannot implicitly clear uncertainty');
select is((select to_jsonb(q) from private.user_report_email_queue q where report_id='81000000-0000-4000-8000-000000000006'),(select queue from delivery_snapshot),'Send/Test leave complete queue snapshot unchanged');
select is((select to_jsonb(r) from private.external_user_monthly_reports r where id='81000000-0000-4000-8000-000000000006'),(select report from delivery_snapshot),'Send/Test leave complete report snapshot unchanged');
select is((private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000002','retry',false)->>'code')::integer,409,'disabled gate still denies explicit Retry');
select is((select last_error from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000006'),'Email delivery outcome is unknown. Check provider logs before retrying.','disabled gate preserves queue uncertainty');
select is((select last_delivery_error from private.external_user_monthly_reports where id='81000000-0000-4000-8000-000000000006'),'Email delivery outcome is unknown. Check provider logs before retrying.','disabled gate preserves report uncertainty');
select is((select count(*)::integer from private.claim_periodic_report_emails('synthetic-worker')),0,'unknown blocked delivery is never claimed automatically');
select is((private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000002','retry',true)->>'code')::integer,200,'explicit operator Retry remains intentional');
select is((select status from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000006'),'queued','explicit Retry makes delivery claimable');
select is((select last_error from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000006'),null::text,'explicit Retry resets marker only after operator action');
-- Finish this synthetic case so it cannot be claimed by the next case.
select private.request_periodic_report_delivery('81000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000002','cancel',true);
-- Definitive rejection remains retryable, subject to the existing queue deadline.
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,report_approval_status,updated_at)
 values('81000000-0000-4000-8000-000000000007','81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000004','Synthetic rejection','Synthetic progress','','PENDING',now());
update private.external_user_monthly_reports set report_approval_status='APPROVED',approved_by='81000000-0000-4000-8000-000000000003',approved_at=now() where id='81000000-0000-4000-8000-000000000007';
update private.user_report_email_queue set status='failed',last_error='Email provider rejected the delivery.',next_attempt_at=now()+interval '1 hour' where report_id='81000000-0000-4000-8000-000000000007';
update private.external_user_monthly_reports set delivery_status='failed',last_delivery_error='Email provider rejected the delivery.' where id='81000000-0000-4000-8000-000000000007';
select is((select count(*)::integer from private.claim_periodic_report_emails('synthetic-rejection-worker',12,now())),0,'known rejection respects retry deadline');
select is((select count(*)::integer from private.claim_periodic_report_emails('synthetic-rejection-worker',12,now()+interval '2 hours')),1,'known rejection is automatically claimable after deadline');
select is((select status from private.user_report_email_queue where report_id='81000000-0000-4000-8000-000000000007'),'processing','known retry publishes processing state');
select throws_ok($q$set local role authenticated; select private.periodic_report_delivery_contract_ready()$q$,'42501',null,'actual browser role cannot invoke readiness');
select * from finish();
rollback;
