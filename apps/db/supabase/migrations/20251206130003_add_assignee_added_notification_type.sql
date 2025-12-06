-- Migration: Add task_assignee_added notification type
-- This enables notifications when users are assigned to tasks

-- Step 1: Update the notifications type constraint to include task_assignee_added
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
        'task_assignee_added',
        'task_assignee_removed',
        'task_project_linked',
        'task_project_unlinked',
        'deadline_reminder',
        'workspace_invite',
        'system_announcement'
    ));

-- Step 2: Add email configuration for task_assignee_added (batched delivery)
INSERT INTO public.notification_email_config (
    notification_type,
    delivery_mode,
    email_template,
    batch_window_minutes,
    enabled
)
VALUES (
    'task_assignee_added',
    'batched',
    NULL,
    10,
    true
)
ON CONFLICT (notification_type) DO NOTHING;

-- Step 3: Update constraint comment
COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS 'Validates notification types. Includes task lifecycle events (assigned, updated, completed), task property changes (labels, priority, dates, estimation, assignees added/removed, projects), deadline reminders, and system events (workspace invites, announcements)';
