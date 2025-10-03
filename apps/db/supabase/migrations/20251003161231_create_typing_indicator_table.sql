-- Create typing indicators table
CREATE TABLE IF NOT EXISTS public.workspace_chat_typing_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.workspace_chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_typing_indicators_channel_id ON public.workspace_chat_typing_indicators(channel_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_updated_at ON public.workspace_chat_typing_indicators(updated_at);

-- Enable Row Level Security
ALTER TABLE public.workspace_chat_typing_indicators ENABLE ROW LEVEL SECURITY;

-- RLS Policies for typing indicators
-- Users can view typing indicators in channels they are part of
CREATE POLICY "Users can view typing indicators in their channels"
    ON public.workspace_chat_typing_indicators FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.workspace_chat_channels c
            INNER JOIN public.workspace_members m ON m.ws_id = c.ws_id
            WHERE c.id = channel_id
            AND m.user_id = auth.uid()
        )
    );

-- Users can create their own typing indicator
CREATE POLICY "Users can create their typing indicator"
    ON public.workspace_chat_typing_indicators FOR INSERT
    WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1
            FROM public.workspace_chat_channels c
            INNER JOIN public.workspace_members m ON m.ws_id = c.ws_id
            WHERE c.id = channel_id
            AND m.user_id = auth.uid()
        )
    );

-- Users can update their own typing indicator
CREATE POLICY "Users can update their typing indicator"
    ON public.workspace_chat_typing_indicators FOR UPDATE
    USING (user_id = auth.uid());

-- Users can delete their own typing indicator
CREATE POLICY "Users can delete their typing indicator"
    ON public.workspace_chat_typing_indicators FOR DELETE
    USING (user_id = auth.uid());

-- Enable Realtime for typing indicators
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_chat_typing_indicators;

-- Function to automatically clean up old typing indicators (older than 5 seconds)
CREATE OR REPLACE FUNCTION public.cleanup_old_typing_indicators()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.workspace_chat_typing_indicators
    WHERE updated_at < NOW() - INTERVAL '5 seconds';
END;
$$;

-- Note: You can optionally set up a pg_cron job to run this cleanup function periodically
-- Or handle cleanup in application logic
SELECT cron.schedule('*/1 * * * *', 'SELECT public.cleanup_old_typing_indicators()');