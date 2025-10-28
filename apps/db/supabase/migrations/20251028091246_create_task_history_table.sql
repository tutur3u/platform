-- Create task_history table to track all task changes permanently
-- This provides a complete audit trail separate from temporary notifications

CREATE TABLE IF NOT EXISTS public.task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Change identification
    change_type TEXT NOT NULL, -- 'field_updated', 'assignee_added', 'assignee_removed', 'label_added', 'label_removed', 'project_linked', 'project_unlinked'
    field_name TEXT, -- 'name', 'priority', 'end_date', 'start_date', 'estimation_points', 'description', 'list_id', 'completed'

    -- Change values stored as JSONB for flexibility
    old_value JSONB,
    new_value JSONB,

    -- Additional context
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Soft delete support
    deleted_at TIMESTAMPTZ,

    CONSTRAINT task_history_change_type_check CHECK (
        change_type IN (
            'field_updated',
            'assignee_added',
            'assignee_removed',
            'label_added',
            'label_removed',
            'project_linked',
            'project_unlinked'
        )
    )
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_task_history_task_id
    ON public.task_history(task_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_history_changed_at
    ON public.task_history(changed_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_history_task_changed
    ON public.task_history(task_id, changed_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_history_change_type
    ON public.task_history(change_type)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_history_changed_by
    ON public.task_history(changed_by)
    WHERE deleted_at IS NULL;

-- Enable Row Level Security
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view task history for tasks they have access to
-- Access is determined by workspace membership through the task hierarchy
CREATE POLICY task_history_select_policy ON public.task_history
    FOR SELECT
    USING (
        task_id IN (
            SELECT t.id
            FROM public.tasks t
            JOIN public.task_lists tl ON t.list_id = tl.id
            JOIN public.workspace_boards wb ON tl.board_id = wb.id
            JOIN public.workspace_members wm ON wb.ws_id = wm.ws_id
            WHERE wm.user_id = auth.uid()
                AND t.deleted_at IS NULL
        )
    );

-- RLS Policy: Only the system (triggers) can insert history records
-- This prevents manual manipulation of the audit trail
CREATE POLICY task_history_insert_policy ON public.task_history
    FOR INSERT
    WITH CHECK (false); -- No manual inserts allowed, only through triggers

-- RLS Policy: No updates allowed - history is immutable
CREATE POLICY task_history_update_policy ON public.task_history
    FOR UPDATE
    USING (false);

-- RLS Policy: No deletes allowed - history is permanent
-- (soft delete via deleted_at field if needed)
CREATE POLICY task_history_delete_policy ON public.task_history
    FOR DELETE
    USING (false);

-- Comments for documentation
COMMENT ON TABLE public.task_history IS 'Permanent audit trail of all task changes including field updates, assignee changes, label changes, and project links';
COMMENT ON COLUMN public.task_history.change_type IS 'Type of change: field_updated, assignee_added/removed, label_added/removed, project_linked/unlinked';
COMMENT ON COLUMN public.task_history.field_name IS 'Name of the field that changed (for field_updated changes)';
COMMENT ON COLUMN public.task_history.old_value IS 'Previous value as JSONB (flexible format)';
COMMENT ON COLUMN public.task_history.new_value IS 'New value as JSONB (flexible format)';
COMMENT ON COLUMN public.task_history.metadata IS 'Additional context like workspace_id, board_id, list_id, etc.';
