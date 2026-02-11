-- Disable audit tracking for tasks, task_assignees, and workspace_calendar_events tables
-- These tables generate high volumes of changes that don't require audit history

-- Disable tracking for tasks table
select audit.disable_tracking('public.tasks'::regclass);

-- Disable tracking for task_assignees table
select audit.disable_tracking('public.task_assignees'::regclass);

-- Disable tracking for workspace_calendar_events table
select audit.disable_tracking('public.workspace_calendar_events'::regclass);
