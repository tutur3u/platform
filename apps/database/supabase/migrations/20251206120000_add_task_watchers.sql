-- Migration: Add task_watchers table for tracking users who want notifications about tasks
-- This enables the "All watchers" feature for deadline reminder notifications

-- Create task_watchers table
CREATE TABLE IF NOT EXISTS public.task_watchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(task_id, user_id)
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_task_watchers_task_id ON public.task_watchers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_watchers_user_id ON public.task_watchers(user_id);

-- Enable RLS
ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view watchers for tasks they can access (workspace members)
CREATE POLICY "Users can view task watchers for accessible tasks" ON public.task_watchers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.task_lists tl ON t.list_id = tl.id
            JOIN public.workspace_boards wb ON tl.board_id = wb.id
            JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
            WHERE t.id = task_watchers.task_id
            AND wm.user_id = auth.uid()
        )
    );

-- RLS Policy: Users can add themselves as watchers for accessible tasks
CREATE POLICY "Users can add themselves as watchers" ON public.task_watchers
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.task_lists tl ON t.list_id = tl.id
            JOIN public.workspace_boards wb ON tl.board_id = wb.id
            JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
            WHERE t.id = task_watchers.task_id
            AND wm.user_id = auth.uid()
        )
    );

-- RLS Policy: Users can remove themselves as watchers
CREATE POLICY "Users can remove themselves as watchers" ON public.task_watchers
    FOR DELETE USING (user_id = auth.uid());

-- Function to auto-add assignees as watchers
CREATE OR REPLACE FUNCTION public.auto_add_assignee_as_watcher()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert the assignee as a watcher if not already watching
    INSERT INTO public.task_watchers (task_id, user_id)
    VALUES (NEW.task_id, NEW.user_id)
    ON CONFLICT (task_id, user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on task_assignees insert to auto-add as watcher
DROP TRIGGER IF EXISTS auto_add_assignee_as_watcher_trigger ON public.task_assignees;
CREATE TRIGGER auto_add_assignee_as_watcher_trigger
    AFTER INSERT ON public.task_assignees
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_add_assignee_as_watcher();

-- Comment for documentation
COMMENT ON TABLE public.task_watchers IS 'Tracks users who are watching tasks for notifications (due date reminders, updates, etc.)';
COMMENT ON FUNCTION public.auto_add_assignee_as_watcher IS 'Automatically adds task assignees as watchers to receive due date reminders';
