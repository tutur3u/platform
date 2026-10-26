-- Tutoring follow-up notification foundation (inert; no caller is wired yet).
--
-- 1. Two notification types: the single-step weak-support content alert sent
--    to every class homeroom teacher and the office at once, and the tutor's
--    "Hoàn thành" notice sent to every homeroom teacher of the class.
-- 2. private.tutoring_weak_support_reviews holds the per-student, per-class
--    review clock. Keeping content is the only homeroom-teacher action with no
--    existing timestamp; edits create a user_feedbacks row and thoát kèm clears
--    require_attention. user_feedbacks is writable by any workspace member over
--    the Data API, so the clock lives here, writable only by the service role.
-- 3. An optional tutor comment on each tutoring session.
-- 4. private.tutoring_notification_receipts records each recipient decision.
--    public.notifications has no unique key, recipients may delete rows, and
--    create_notification returns null without a row when preferences suppress
--    every channel, so it cannot deduplicate a daily job or a repeated mark.
--
-- The office is resolved from existing workspace permissions (admin or
-- approve_reports); no role, column, or table is added for it.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.notifications
  drop constraint if exists notifications_type_check;

-- The new list is a strict superset of the previous one, so existing rows
-- already satisfy it. The constraint stays NOT VALID: new writes are still
-- checked, and no validation scan runs while ACCESS EXCLUSIVE is held.
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
    'mail_received',
    'tutoring_weak_content_review_due',
    'tutoring_session_completed'
  )) not valid;

comment on constraint notifications_type_check on public.notifications is
  'Validates notification types for task activity, workspace/system notices, approvals, time tracking request workflows, chat messages, incoming Mail, and tutoring follow-ups.';

alter table private.workspace_tutoring_sessions
  add column tutor_comment text
  constraint workspace_tutoring_sessions_tutor_comment_check check (
    tutor_comment is null
    or (char_length(tutor_comment) <= 2000 and btrim(tutor_comment) <> '')
  );

comment on column private.workspace_tutoring_sessions.tutor_comment is
  'Optional tutor note for the session, shown to homeroom teachers. Null when omitted.';

create table private.tutoring_weak_support_reviews (
  group_id uuid not null
    references public.workspace_user_groups(id) on delete cascade,
  student_user_id uuid not null
    references public.workspace_users(id) on delete cascade,
  last_reviewed_at timestamptz not null default now(),
  primary key (group_id, student_user_id)
);

create index tutoring_weak_support_reviews_student_idx
  on private.tutoring_weak_support_reviews (student_user_id);

comment on table private.tutoring_weak_support_reviews is
  'Last homeroom-teacher review of a student''s weak-support content in a class. The two-week clock starts at the later of this and the latest require_attention feedback.';

create table private.tutoring_notification_receipts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  group_id uuid references public.workspace_user_groups(id) on delete cascade,
  student_user_id uuid
    references public.workspace_users(id) on delete cascade,
  review_cycle_started_at timestamptz,
  tutoring_session_id uuid
    references private.workspace_tutoring_sessions(id) on delete cascade,
  recipient_user_id uuid not null
    references public.users(id) on delete cascade,
  notification_id uuid
    references public.notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tutoring_notification_receipts_kind_check check (
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
  ),
  -- Null key columns of the other kind never collide, so these full unique
  -- constraints act per kind and remain usable as ON CONFLICT targets.
  constraint tutoring_notification_receipts_review_key unique (
    group_id, student_user_id, review_cycle_started_at, recipient_user_id
  ),
  constraint tutoring_notification_receipts_session_key unique (
    tutoring_session_id, recipient_user_id
  )
);

create index tutoring_notification_receipts_student_idx
  on private.tutoring_notification_receipts (student_user_id)
  where student_user_id is not null;

create index tutoring_notification_receipts_recipient_idx
  on private.tutoring_notification_receipts (recipient_user_id);

create index tutoring_notification_receipts_notification_idx
  on private.tutoring_notification_receipts (notification_id)
  where notification_id is not null;

comment on table private.tutoring_notification_receipts is
  'One row per tutoring follow-up recipient decision, claimed before notifying so a rerun never notifies twice.';

alter table private.tutoring_weak_support_reviews enable row level security;
alter table private.tutoring_notification_receipts enable row level security;

revoke all on table private.tutoring_weak_support_reviews
  from public, anon, authenticated;
revoke all on table private.tutoring_notification_receipts
  from public, anon, authenticated;

grant select, insert, update, delete
  on table private.tutoring_weak_support_reviews to service_role;
grant select, insert, update, delete
  on table private.tutoring_notification_receipts to service_role;

notify pgrst, 'reload schema';
