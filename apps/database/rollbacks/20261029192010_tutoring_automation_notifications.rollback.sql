-- Rollback for 20261029192010_tutoring_automation_notifications.sql.
-- Run before the 20261029192000 rollback. Deletes absence-reminder and
-- lesson-report receipts (their data is lost), drops their columns and keys,
-- and restores the previous receipt kind check.
--
-- The two notification types stay in notifications_type_check on purpose.
-- A CHECK constraint, even NOT VALID, is re-checked on every UPDATE, so
-- removing the types would make kept notifications of those types fail
-- mark-read and archive with 23514. Keeping them is inert: nothing sends them
-- once the foundation is rolled back. Grants nothing.
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

delete from private.tutoring_notification_receipts
where kind in ('absence_reminder', 'lesson_report');

alter table private.tutoring_notification_receipts
  drop constraint if exists tutoring_notification_receipts_absence_key,
  drop constraint if exists tutoring_notification_receipts_report_key,
  drop constraint if exists tutoring_notification_receipts_kind_check;

alter table private.tutoring_notification_receipts
  drop column if exists absence_followup_id,
  drop column if exists report_date,
  drop column if exists ws_id;

alter table private.tutoring_notification_receipts
  add constraint tutoring_notification_receipts_kind_check check (
    (
      kind = 'weak_content_review_due'
      and group_id is not null
      and student_user_id is not null
      and review_cycle_started_at is not null
      and tutoring_session_id is null
    )
    or (
      kind = 'session_completed'
      and tutoring_session_id is not null
      and group_id is null
      and student_user_id is null
      and review_cycle_started_at is null
    )
  );

notify pgrst, 'reload schema';

commit;
