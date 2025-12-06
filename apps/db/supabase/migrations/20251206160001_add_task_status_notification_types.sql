-- Migration: Add missing notification types for task status changes
-- This enables notifications for:
-- - task_moved (when tasks are moved between columns/lists)
-- - task_completed / task_reopened (when task completion status changes)
-- - task_deleted / task_restored (when tasks are soft deleted or restored)

-- Step 1: Update the notifications type constraint to include new types
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
        'task_moved',           -- NEW: when tasks are moved between lists
        'task_completed',       -- NEW: when tasks are marked complete
        'task_reopened',        -- NEW: when completed tasks are reopened
        'task_deleted',         -- NEW: when tasks are soft deleted
        'task_restored',        -- NEW: when deleted tasks are restored
        'deadline_reminder',
        'workspace_invite',
        'system_announcement'
    ));

-- Step 2: Add email configuration for new notification types (batched delivery)
INSERT INTO public.notification_email_config (
    notification_type,
    delivery_mode,
    email_template,
    batch_window_minutes,
    enabled
)
VALUES
    ('task_moved', 'batched', NULL, 10, true),
    ('task_completed', 'batched', NULL, 10, true),
    ('task_reopened', 'batched', NULL, 10, true),
    ('task_deleted', 'batched', NULL, 10, true),
    ('task_restored', 'batched', NULL, 10, true)
ON CONFLICT (notification_type) DO NOTHING;

-- Step 3: Update constraint comment
COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS 'Validates notification types. Includes task lifecycle events (assigned, updated, completed, reopened, deleted, restored, moved), task property changes (labels, priority, dates, estimation, assignees added/removed, projects), deadline reminders, and system events (workspace invites, announcements)';
