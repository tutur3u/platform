-- Create notifications table for first-class notification support
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- Recipient of the notification
    type TEXT NOT NULL, -- task_assigned, task_updated, task_mention, workspace_invite, etc.
    title TEXT NOT NULL,
    description TEXT,
    data JSONB DEFAULT '{}'::jsonb, -- Flexible storage for event-specific data
    entity_type TEXT, -- 'task', 'workspace', 'project', etc.
    entity_id UUID, -- Reference to the entity that triggered the notification
    read_at TIMESTAMPTZ, -- NULL = unread, timestamp = read
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID -- User who triggered the notification (if applicable)
);

-- Add foreign key constraints with ON DELETE SET NULL
-- (user_id is made nullable in a later migration to support system broadcasts)
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL,
    ADD CONSTRAINT notifications_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Add CHECK constraint to validate notification types
-- Note: If notification types grow significantly, consider migrating to a lookup table
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
        'workspace_invite',
        'system_announcement'
    ));

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_ws_id ON public.notifications(ws_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON public.notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON public.notifications(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications within workspaces they belong to
CREATE POLICY "Users can view their own notifications"
    ON public.notifications
    FOR SELECT
    USING (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can update their own notifications (mark as read/unread)
CREATE POLICY "Users can update their own notifications"
    ON public.notifications
    FOR UPDATE
    USING (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Policy: System can insert notifications (used by triggers and backend functions)
CREATE POLICY "System can insert notifications"
    ON public.notifications
    FOR INSERT
    WITH CHECK (false);

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
    ON public.notifications
    FOR DELETE
    USING (
        user_id = auth.uid()
        AND ws_id IN (
            SELECT ws_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Add comment for documentation
COMMENT ON TABLE public.notifications IS 'Stores all user notifications across workspaces with support for web, email, SMS, and push notifications';
COMMENT ON COLUMN public.notifications.type IS 'Notification type: task_assigned, task_updated, task_mention, workspace_invite, etc.';
COMMENT ON COLUMN public.notifications.data IS 'JSON data containing event-specific information (task details, changes, etc.)';
COMMENT ON COLUMN public.notifications.read_at IS 'Timestamp when notification was marked as read. NULL indicates unread.';
