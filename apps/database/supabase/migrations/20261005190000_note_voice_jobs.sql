-- Notes artifacts are private to the requesting actor, including in team workspaces.
CREATE TABLE private.note_voice_jobs (
  id uuid PRIMARY KEY,
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','transcribing','summarizing','completed','failed','review_required')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  transcript text,
  artifact jsonb CHECK (artifact IS NULL OR jsonb_typeof(artifact) = 'object'),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'completed' OR (transcript IS NOT NULL AND artifact IS NOT NULL))
);
CREATE INDEX note_voice_jobs_owner ON private.note_voice_jobs(user_id, ws_id, created_at DESC);
ALTER TABLE private.note_voice_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY note_voice_jobs_owner_read ON private.note_voice_jobs FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.workspace_members wm WHERE wm.ws_id = note_voice_jobs.ws_id AND wm.user_id = (SELECT auth.uid())
  )
);
REVOKE ALL ON private.note_voice_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.note_voice_jobs TO authenticated;
GRANT ALL ON private.note_voice_jobs TO service_role;
COMMENT ON TABLE private.note_voice_jobs IS 'Actor-owned Notes transcripts/proposals. No recording bytes or automatic task/calendar writes. Service-only processing and paid retry transitions.';
