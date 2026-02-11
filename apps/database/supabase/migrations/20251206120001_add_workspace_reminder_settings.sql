-- Migration: Add workspace_task_reminder_settings table for configurable reminder intervals
-- This enables per-workspace configuration of when deadline reminders are sent

-- Create workspace_task_reminder_settings table
CREATE TABLE IF NOT EXISTS public.workspace_task_reminder_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    reminder_intervals JSONB NOT NULL DEFAULT '["24h", "1h"]'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(ws_id)
);

-- Add index for workspace lookup
CREATE INDEX IF NOT EXISTS idx_workspace_task_reminder_settings_ws_id
    ON public.workspace_task_reminder_settings(ws_id);

-- Enable RLS
ALTER TABLE public.workspace_task_reminder_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view reminder settings
CREATE POLICY "Workspace members can view reminder settings" ON public.workspace_task_reminder_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.ws_id = workspace_task_reminder_settings.ws_id
            AND wm.user_id = auth.uid()
        )
    );

-- RLS Policy: Users with manage_workspace_settings permission can manage reminder settings
CREATE POLICY "Allow settings managers to manage reminder settings" ON public.workspace_task_reminder_settings
    FOR ALL USING (
        public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings')
    ) WITH CHECK (
        public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_settings')
    );

-- Trigger for updated_at
CREATE TRIGGER update_workspace_task_reminder_settings_updated_at
    BEFORE UPDATE ON public.workspace_task_reminder_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE public.workspace_task_reminder_settings IS 'Per-workspace settings for task due date reminder intervals';
COMMENT ON COLUMN public.workspace_task_reminder_settings.reminder_intervals IS 'Array of interval strings: "24h", "12h", "6h", "1h", "30m", "2d", "7d"';
