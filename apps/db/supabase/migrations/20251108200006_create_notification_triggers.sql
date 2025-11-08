-- Trigger for task assignment notifications
-- Fires when a new task assignee is added
CREATE TRIGGER notify_on_task_assigned
    AFTER INSERT ON public.task_assignees
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_assigned();

-- Trigger for task update notifications
-- Fires when a task is updated (status, priority, due date, list, etc.)
CREATE TRIGGER notify_on_task_updated
    AFTER UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_updated();

-- Add comments for documentation
COMMENT ON TRIGGER notify_on_task_assigned ON public.task_assignees IS 'Creates notifications when users are assigned to tasks';
COMMENT ON TRIGGER notify_on_task_updated ON public.tasks IS 'Creates notifications when tasks are updated (status, priority, due date, etc.)';
