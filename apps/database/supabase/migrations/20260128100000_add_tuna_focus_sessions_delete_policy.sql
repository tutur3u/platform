-- Migration: Add missing DELETE policy for tuna_focus_sessions
-- The original migration only included SELECT, INSERT, UPDATE policies but not DELETE

-- tuna_focus_sessions: Allow users to delete their own sessions
CREATE POLICY "tuna_focus_sessions_delete" ON public.tuna_focus_sessions
  FOR DELETE USING (user_id = auth.uid());
