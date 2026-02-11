-- Migration: Add deadline_reminder notification type and email configuration
-- This enables immediate email delivery for deadline reminder notifications

-- Step 1: Update the notifications type constraint to include deadline_reminder
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check CHECK (type IN (
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
        'task_assignee_removed',
        'task_project_linked',
        'task_project_unlinked',
        'deadline_reminder',
        'workspace_invite',
        'system_announcement'
    ));

-- Step 2: Add email configuration for deadline_reminder (immediate delivery, high priority)
INSERT INTO public.notification_email_config (
    notification_type,
    delivery_mode,
    email_template,
    email_subject_template,
    priority_override,
    batch_window_minutes,
    enabled
)
VALUES (
    'deadline_reminder',
    'immediate',
    'deadline-reminder',
    'Task Due Soon: {task_name}',
    'high',
    0,
    true
)
ON CONFLICT (notification_type) DO UPDATE
SET delivery_mode = 'immediate',
    email_template = 'deadline-reminder',
    email_subject_template = 'Task Due Soon: {task_name}',
    priority_override = 'high',
    batch_window_minutes = 0,
    enabled = true,
    updated_at = now();

-- Step 3: Update constraint comment
COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS 'Validates notification types. Includes task lifecycle events (assigned, updated, completed), task property changes (labels, priority, dates, estimation, assignees, projects), deadline reminders, and system events (workspace invites, announcements)';
