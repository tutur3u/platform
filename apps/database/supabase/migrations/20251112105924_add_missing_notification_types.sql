-- Add missing notification types to the notifications_type_check constraint
-- This fixes the issue where task_assignee_removed, task_project_linked, and task_project_unlinked
-- notification types are used by triggers but not allowed by the constraint

-- Drop the existing constraint
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the constraint with all existing types plus the missing ones
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
        'workspace_invite',
        'system_announcement'
    ));

-- Add comment explaining the new types
COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS 'Validates notification types. Includes task lifecycle events (assigned, updated, completed), task property changes (labels, priority, dates, estimation, assignees, projects), and system events (workspace invites, announcements)';
