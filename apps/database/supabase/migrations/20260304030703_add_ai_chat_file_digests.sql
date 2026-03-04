CREATE TABLE IF NOT EXISTS public.ai_chat_file_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES public.ai_chats(id) ON DELETE CASCADE,
  message_id UUID NULL REFERENCES public.ai_chat_messages(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_size BIGINT NULL,
  digest_version INTEGER NOT NULL,
  processor_model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
  title TEXT NULL,
  summary TEXT NULL,
  answer_context_markdown TEXT NULL,
  extracted_markdown TEXT NULL,
  structured JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_alias TEXT NULL,
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_chat_file_digests_storage_path_digest_version_key
  ON public.ai_chat_file_digests (storage_path, digest_version);

CREATE INDEX IF NOT EXISTS idx_ai_chat_file_digests_chat_created_at
  ON public.ai_chat_file_digests (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_file_digests_message_id
  ON public.ai_chat_file_digests (message_id);

ALTER TABLE public.ai_chat_file_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_chat_file_digests_select_authenticated"
  ON public.ai_chat_file_digests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_chats ac
      WHERE ac.id = ai_chat_file_digests.chat_id
        AND (ac.creator_id = auth.uid() OR ac.is_public = true)
    )
  );

DROP TRIGGER IF EXISTS update_ai_chat_file_digests_updated_at
  ON public.ai_chat_file_digests;

CREATE TRIGGER update_ai_chat_file_digests_updated_at
  BEFORE UPDATE ON public.ai_chat_file_digests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
