-- Live API Session Management
-- Stores session handles for resuming Live API sessions across WebSocket reconnections

CREATE TABLE IF NOT EXISTS public.live_api_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_handle TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ws_id)  -- One active session per user per workspace
);

-- Index for efficient lookups
CREATE INDEX idx_live_api_sessions_user_ws ON public.live_api_sessions(user_id, ws_id);
CREATE INDEX idx_live_api_sessions_expires ON public.live_api_sessions(expires_at);

-- RLS policies
ALTER TABLE public.live_api_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sessions"
  ON public.live_api_sessions
  FOR ALL
  USING (auth.uid() = user_id);

-- Function to cleanup expired sessions (called manually or via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_live_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM public.live_api_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
