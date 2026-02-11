-- Migration: Add task_reminder_sent table to prevent duplicate reminder notifications
-- This tracks which reminders have already been sent for a task/user/interval combination

-- Create task_reminder_sent table
CREATE TABLE IF NOT EXISTS public.task_reminder_sent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reminder_interval TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
    UNIQUE(task_id, user_id, reminder_interval)
);

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_task_reminder_sent_task_user
    ON public.task_reminder_sent(task_id, user_id);
CREATE INDEX IF NOT EXISTS idx_task_reminder_sent_sent_at
    ON public.task_reminder_sent(sent_at);

-- Enable RLS
ALTER TABLE public.task_reminder_sent ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own reminder history
CREATE POLICY "Users can view their own reminder history" ON public.task_reminder_sent
    FOR SELECT USING (user_id = auth.uid());

-- RLS Policy: Service role can manage all reminders (for cron job)
CREATE POLICY "Service role can manage reminders" ON public.task_reminder_sent
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE public.task_reminder_sent IS 'Tracks which deadline reminders have been sent to prevent duplicate notifications';
COMMENT ON COLUMN public.task_reminder_sent.reminder_interval IS 'The interval that was triggered (e.g., "24h", "1h", "30m")';
