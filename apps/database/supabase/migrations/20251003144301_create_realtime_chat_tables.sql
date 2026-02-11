-- Create chat channels table
CREATE TABLE IF NOT EXISTS public.workspace_chat_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chat channel participants table
CREATE TABLE IF NOT EXISTS public.workspace_chat_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.workspace_chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

-- Create chat messages table
CREATE TABLE IF NOT EXISTS public.workspace_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.workspace_chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_channels_ws_id ON public.workspace_chat_channels(ws_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_channel_id ON public.workspace_chat_participants(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON public.workspace_chat_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id ON public.workspace_chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.workspace_chat_messages(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.workspace_chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat channels
CREATE POLICY "Users can view channels in their workspace"
    ON public.workspace_chat_channels FOR SELECT
    USING (
        ws_id IN (
            SELECT ws_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Workspace members can create channels"
    ON public.workspace_chat_channels FOR INSERT
    WITH CHECK (
        ws_id IN (
            SELECT ws_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Channel creators can update their channels"
    ON public.workspace_chat_channels FOR UPDATE
    USING (created_by = auth.uid());

CREATE POLICY "Channel creators can delete their channels"
    ON public.workspace_chat_channels FOR DELETE
    USING (created_by = auth.uid());

-- RLS Policies for chat participants
CREATE POLICY "Users can view participants in their channels"
    ON public.workspace_chat_participants FOR SELECT
    USING (
        channel_id IN (
            SELECT channel_id FROM public.workspace_chat_participants
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join channels in their workspace"
    ON public.workspace_chat_participants FOR INSERT
    WITH CHECK (
        user_id = auth.uid() AND
        channel_id IN (
            SELECT id FROM public.workspace_chat_channels
            WHERE ws_id IN (
                SELECT ws_id FROM public.workspace_members
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can leave channels"
    ON public.workspace_chat_participants FOR DELETE
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their participant status"
    ON public.workspace_chat_participants FOR UPDATE
    USING (user_id = auth.uid());

-- RLS Policies for chat messages
CREATE POLICY "Participants can view messages in their channels"
    ON public.workspace_chat_messages FOR SELECT
    USING (
        channel_id IN (
            SELECT channel_id FROM public.workspace_chat_participants
            WHERE user_id = auth.uid()
        ) AND
        deleted_at IS NULL
    );

CREATE POLICY "Participants can send messages"
    ON public.workspace_chat_messages FOR INSERT
    WITH CHECK (
        user_id = auth.uid() AND
        channel_id IN (
            SELECT channel_id FROM public.workspace_chat_participants
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own messages"
    ON public.workspace_chat_messages FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can soft delete their own messages"
    ON public.workspace_chat_messages FOR DELETE
    USING (user_id = auth.uid());

-- Enable Realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_chat_participants;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_chat_channels_updated_at
    BEFORE UPDATE ON public.workspace_chat_channels
    FOR EACH ROW
    EXECUTE FUNCTION public.update_chat_updated_at();

CREATE TRIGGER update_chat_messages_updated_at
    BEFORE UPDATE ON public.workspace_chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_chat_updated_at();

-- Create a security definer function to check if user is in a channel
-- This bypasses RLS and prevents recursion
CREATE OR REPLACE FUNCTION public.user_is_in_channel(p_channel_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_chat_participants
        WHERE channel_id = p_channel_id
        AND user_id = p_user_id
    );
$$;

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view participants in their channels" ON public.workspace_chat_participants;
DROP POLICY IF EXISTS "Participants can view messages in their channels" ON public.workspace_chat_messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.workspace_chat_messages;

-- Recreate participants SELECT policy using the function
CREATE POLICY "Users can view participants in their channels"
    ON public.workspace_chat_participants FOR SELECT
    USING (
        user_is_in_channel(channel_id, auth.uid())
    );

-- Recreate messages policies using the function
CREATE POLICY "Participants can view messages in their channels"
    ON public.workspace_chat_messages FOR SELECT
    USING (
        user_is_in_channel(channel_id, auth.uid()) AND
        deleted_at IS NULL
    );

CREATE POLICY "Participants can send messages"
    ON public.workspace_chat_messages FOR INSERT
    WITH CHECK (
        user_id = auth.uid() AND
        user_is_in_channel(channel_id, auth.uid())
    );
-- Fix INSERT policy for participants - allow joining if channel exists in their workspace
DROP POLICY IF EXISTS "Users can join channels in their workspace" ON public.workspace_chat_participants;

CREATE POLICY "Users can join channels in their workspace"
    ON public.workspace_chat_participants FOR INSERT
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

-- Fix INSERT policy for messages - allow sending if user is participant OR if inserting first message when joining
DROP POLICY IF EXISTS "Participants can send messages" ON public.workspace_chat_messages;

CREATE POLICY "Participants can send messages"
    ON public.workspace_chat_messages FOR INSERT
    WITH CHECK (
        user_id = auth.uid() AND
        user_is_in_channel(channel_id, auth.uid())
    );
-- Fix message INSERT policy to allow sending messages in workspace channels
-- Users can send messages if the channel exists in their workspace
DROP POLICY IF EXISTS "Participants can send messages" ON public.workspace_chat_messages;

CREATE POLICY "Participants can send messages"
    ON public.workspace_chat_messages FOR INSERT
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
-- Fix UPDATE policy for participants to allow upsert operations
DROP POLICY IF EXISTS "Users can update their participant status" ON public.workspace_chat_participants;

CREATE POLICY "Users can update their participant status"
    ON public.workspace_chat_participants FOR UPDATE
    USING (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 
            FROM public.workspace_chat_channels c
            INNER JOIN public.workspace_members m ON m.ws_id = c.ws_id
            WHERE c.id = channel_id
            AND m.user_id = auth.uid()
        )
    );
-- Drop all existing participant policies
DROP POLICY IF EXISTS "Users can view participants in their channels" ON public.workspace_chat_participants;
DROP POLICY IF EXISTS "Users can join channels in their workspace" ON public.workspace_chat_participants;
DROP POLICY IF EXISTS "Users can leave channels" ON public.workspace_chat_participants;
DROP POLICY IF EXISTS "Users can update their participant status" ON public.workspace_chat_participants;

-- Create simple, permissive policies for participants
-- Allow viewing if user is in the workspace of the channel
CREATE POLICY "Users can view participants in their channels"
    ON public.workspace_chat_participants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 
            FROM public.workspace_chat_channels c
            INNER JOIN public.workspace_members m ON m.ws_id = c.ws_id
            WHERE c.id = channel_id
            AND m.user_id = auth.uid()
        )
    );

-- Allow joining if channel exists in user's workspace
CREATE POLICY "Users can join channels in their workspace"
    ON public.workspace_chat_participants FOR INSERT
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

-- Allow updating own participant record in workspace channels
CREATE POLICY "Users can update their participant status"
    ON public.workspace_chat_participants FOR UPDATE
    USING (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 
            FROM public.workspace_chat_channels c
            INNER JOIN public.workspace_members m ON m.ws_id = c.ws_id
            WHERE c.id = channel_id
            AND m.user_id = auth.uid()
        )
    );

-- Allow leaving channels
CREATE POLICY "Users can leave channels"
    ON public.workspace_chat_participants FOR DELETE
    USING (user_id = auth.uid());