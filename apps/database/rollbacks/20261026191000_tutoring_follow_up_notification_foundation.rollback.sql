-- Rollback for 20261026191000_tutoring_follow_up_notification_foundation.sql.
-- Drops the review clock, the receipts, and the tutor comment column (their
-- data is lost), and restores the previous notification type list. The
-- restored constraint stays NOT VALID, so existing tutoring notifications are
-- kept, new rows of the removed types are rejected, and no validation scan
-- runs while ACCESS EXCLUSIVE is held on public.notifications.
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop table if exists private.tutoring_notification_receipts;
drop table if exists private.tutoring_weak_support_reviews;

alter table private.workspace_tutoring_sessions
  drop column if exists tutor_comment;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'task_assigned',
    'task_updated',
    'task_mention',
    'task_label_added',
    'task_label_removed',
    'task_title_changed',
    'task_description_changed',
    'task_priority_changed',
    'task_due_date_changed',
    'task_start_date_changed',
    'task_estimation_changed',
    'task_assignee_added',
    'task_assignee_removed',
    'task_project_linked',
    'task_project_unlinked',
    'task_moved',
    'task_completed',
    'task_reopened',
    'task_deleted',
    'task_restored',
    'deadline_reminder',
    'workspace_invite',
    'system_announcement',
    'account_update',
    'security_alert',
    'report_approved',
    'report_rejected',
    'post_approved',
    'post_rejected',
    'time_tracking_request_submitted',
    'time_tracking_request_resubmitted',
    'time_tracking_request_approved',
    'time_tracking_request_rejected',
    'time_tracking_request_needs_info',
    'chat_message',
    'mail_received'
  )) not valid;

comment on constraint notifications_type_check on public.notifications is
  'Validates notification types for task activity, workspace/system notices, approvals, time tracking request workflows, chat messages, and incoming Mail.';

notify pgrst, 'reload schema';

commit;
