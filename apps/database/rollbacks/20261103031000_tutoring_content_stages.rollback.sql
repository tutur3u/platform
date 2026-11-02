-- Disable tutoring_content_rules and the Cron Control job before rollback.
-- Fail closed if multiple stages now share a legacy key. Retain the schema and
-- receipts for ops reconciliation rather than deleting any history.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table private.tutoring_notification_receipts
  add constraint tutoring_notification_receipts_review_key unique
  (group_id,student_user_id,review_cycle_started_at,recipient_user_id);
drop function private.process_tutoring_content_rules(integer);
drop table private.tutoring_content_scan_cursor;
drop trigger reset_tutoring_content_clock on public.user_feedbacks;
drop function private.reset_tutoring_content_clock();
drop index private.tutoring_notification_receipts_stage_key;
alter table private.tutoring_notification_receipts drop column stage;
commit;
