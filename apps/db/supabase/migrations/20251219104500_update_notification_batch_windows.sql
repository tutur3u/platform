-- ============================================================================
-- UPDATE NOTIFICATION BATCH WINDOWS FOR BETTER UX
-- ============================================================================
-- This migration updates the batch window durations for different notification types
-- to provide a better user experience:
-- - Task assignments and deadline changes: 5 minutes (actionable, user should know quickly)
-- - Other task updates: 15 minutes (allows consolidation of rapid changes)
-- - Task mentions: 5 minutes (already set correctly, keeping it)

-- Update task_assigned to use 5 minute window (faster delivery for actionable items)
UPDATE public.notification_email_config
SET batch_window_minutes = 5,
    updated_at = now()
WHERE notification_type = 'task_assigned';

-- Update task_due_date_changed to use 5 minute window (deadline changes are urgent)
UPDATE public.notification_email_config
SET batch_window_minutes = 5,
    updated_at = now()
WHERE notification_type = 'task_due_date_changed';

-- Update task update notification types to use 15 minute window
-- This allows multiple rapid changes to the same task to be consolidated
UPDATE public.notification_email_config
SET batch_window_minutes = 15,
    updated_at = now()
WHERE notification_type IN (
    'task_updated',
    'task_completed',
    'task_reopened',
    'task_priority_changed',
    'task_moved',
    'task_title_changed',
    'task_description_changed',
    'task_start_date_changed',
    'task_estimation_changed',
    'task_label_added',
    'task_label_removed',
    'task_project_linked',
    'task_project_unlinked',
    'task_assignee_removed'
);

-- Insert any missing notification types with appropriate batch windows
INSERT INTO public.notification_email_config (notification_type, delivery_mode, batch_window_minutes)
VALUES
    ('task_title_changed', 'batched', 15),
    ('task_description_changed', 'batched', 15),
    ('task_start_date_changed', 'batched', 15),
    ('task_estimation_changed', 'batched', 15),
    ('task_label_added', 'batched', 15),
    ('task_label_removed', 'batched', 15),
    ('task_project_linked', 'batched', 15),
    ('task_project_unlinked', 'batched', 15),
    ('task_assignee_removed', 'batched', 15)
ON CONFLICT (notification_type) DO NOTHING;

-- Add comment documenting the batch window strategy
COMMENT ON TABLE public.notification_email_config IS 
'Configuration for notification email delivery. Batch windows are tuned for UX:
- Assignments/mentions/deadline changes: 5 min (actionable, needs quick delivery)
- Other task updates: 15 min (allows consolidation of rapid changes)
- Deadline reminders: Immediate (critical)
- Workspace invites: Immediate (important first impression)';
